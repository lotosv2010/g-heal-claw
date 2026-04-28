import type {
  NavigationTiming,
  PerformanceEvent,
} from "@g-heal-claw/shared";
import type { Metric } from "web-vitals";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import { createBaseEvent } from "../event.js";
import type { Hub } from "../hub.js";
import type { Plugin } from "../plugin.js";
import { mapNavigationTiming } from "./navigation-timing.js";

/**
 * PerformancePlugin 配置（T2.1.1 / ADR-0014）
 */
export interface PerformancePluginOptions {
  /**
   * 是否上报 Navigation 瀑布（挂载在 metric=TTFB 事件的 navigation 字段上）
   * 默认 true；仅在 `document.readyState === 'complete'` 或首次 `load` 事件后采集一次。
   */
  readonly reportNavigation?: boolean;
  /**
   * 是否采集废弃指标（FID / TTI），默认 true
   *
   * FID：First Input Delay，web-vitals v4 已移除，改由 `PerformanceObserver({type:'first-input'})` 直采
   * TTI：Time to Interactive，Google 官方已不再维护 tti-polyfill，此处用 longtask + FCP 做近似
   *
   * 两项仅为向后兼容与面板完整性保留；生产环境主指标以 INP / LCP 为准。
   */
  readonly reportDeprecated?: boolean;
  /**
   * 是否采集 TBT（Total Blocking Time），默认 true
   *
   * TBT = FCP~TTI 窗口内所有 long task 的 sum(max(0, duration - 50))，与 Lighthouse 口径一致。
   * TBT 并非废弃指标（仍是 Lighthouse 性能评分核心组件），与 INP / FID 互补表达加载阶段的阻塞。
   */
  readonly reportTBT?: boolean;
  /**
   * 是否采集 FSP（First Screen Paint，首屏时间），默认 true
   *
   * FSP = `domContentLoadedEventEnd - startTime`，作为"用户看到首屏内容"的代理值。
   * 与 Dashboard "首屏时间 FMP 表 / 性能视图 fmp 系列" 配套 —— 关闭后该视图将无数据。
   */
  readonly reportFSP?: boolean;
}

/** long task 耗时扣减基线（ms）—— Lighthouse TBT 定义 */
const TBT_LONGTASK_BASE_MS = 50;

/** Web Vitals `Metric.name` → `PerformanceEventSchema.metric` 的白名单（FID 由 v4 移除，不走该通道） */
const SUPPORTED_METRICS = new Set<Metric["name"]>([
  "LCP",
  "FCP",
  "CLS",
  "INP",
  "TTFB",
]);

/** web.dev 阈值（与 Dashboard 面板保持一致） */
const FID_RATING_THRESHOLDS = [100, 300] as const;
const TTI_RATING_THRESHOLDS = [3800, 7300] as const;
/** TBT 阈值（web.dev Lighthouse 口径 good ≤ 200ms / needs ≤ 600ms） */
const TBT_RATING_THRESHOLDS = [200, 600] as const;
/** TTI 静默窗口（ms） —— Google 原始 TTI 定义同样为 5000 */
const TTI_QUIET_MS = 5000;
/** TTI 启动后轮询 FCP 就绪的最大次数 / 间隔（ms） */
const TTI_POLL_MAX = 30;
const TTI_POLL_INTERVAL_MS = 200;
/** TBT 观察窗口：load 后再等 TBT_WINDOW_MS 汇总一次（与 Lighthouse "FCP~TTI" 近似） */
const TBT_WINDOW_MS = 5000;

/**
 * FSP（First Screen Paint，首屏时间）阈值
 *  与 UI 侧 FMP 着色对齐：≤1.8s good / ≤3s needs / >3s poor
 */
const FSP_RATING_THRESHOLDS = [1800, 3000] as const;

/**
 * SDK PerformancePlugin 工厂（ADR-0014）
 *
 * 订阅 `web-vitals` 的 LCP/FCP/CLS/INP/TTFB 回调，并在页面加载完成后
 * 通过 `PerformanceNavigationTiming` 采集瀑布阶段。所有事件统一映射到
 * `PerformanceEventSchema`（SPEC §4.2）单事件单指标上报。
 *
 * 额外通道（reportDeprecated=true 时启用）：
 * - FID：直接使用原生 `PerformanceObserver({type:'first-input', buffered:true})`
 * - TTI：`longtask` Observer + FCP 联合推导（见 observeTTI 注释）
 *
 * 失败场景静默降级（与 SDK 对宿主透明原则一致）：
 * - 非浏览器环境（无 `window` / `document`）→ 直接 return
 * - 无 `PerformanceObserver` → 打 warn 并 return（web-vitals 本身依赖它）
 * - 任意订阅异常 → logger 记录但不抛
 */
export function performancePlugin(
  opts: PerformancePluginOptions = {},
): Plugin {
  const reportNavigation = opts.reportNavigation ?? true;
  const reportDeprecated = opts.reportDeprecated ?? true;
  const reportTBT = opts.reportTBT ?? true;
  const reportFSP = opts.reportFSP ?? true;

  return {
    name: "performance",
    setup(hub) {
      // 非浏览器环境（SSR / Worker）直接降级
      if (typeof window === "undefined" || typeof document === "undefined") {
        hub.logger.debug("performance plugin: 非浏览器环境，跳过");
        return;
      }
      if (typeof PerformanceObserver === "undefined") {
        hub.logger.warn(
          "performance plugin: 浏览器无 PerformanceObserver，降级为 no-op",
        );
        return;
      }

      // Navigation 瀑布：一次性采集，挂到 TTFB 事件的 navigation 字段上报
      let pendingNavigation: NavigationTiming | null = null;
      const captureNavigation = (): void => {
        pendingNavigation = readNavigationTiming();
        // 同时派发 FSP（首屏时间）合成事件 —— Dashboard 首屏表与性能视图依赖此指标
        if (reportFSP) {
          const fspMs = readFspMs();
          if (fspMs != null) {
            dispatchSynthetic(
              hub,
              "FSP",
              fspMs,
              ratingOf(fspMs, FSP_RATING_THRESHOLDS),
            );
          }
        }
      };
      if (reportNavigation) {
        if (document.readyState === "complete") {
          captureNavigation();
        } else {
          window.addEventListener("load", captureNavigation, { once: true });
        }
      }

      // FCP 缓存：供 TTI 推导参考
      let fcpValue: number | null = null;

      // Web Vitals 订阅
      const handler = (metric: Metric): void => {
        if (!SUPPORTED_METRICS.has(metric.name)) return;
        if (metric.name === "FCP") {
          fcpValue = metric.value;
        }
        // TTFB 是 Navigation 瀑布的天然载体（`navigation.responseStart - requestStart`）
        const navigation =
          metric.name === "TTFB" ? pendingNavigation ?? undefined : undefined;
        dispatchMetric(hub, metric, navigation);
      };

      // 订阅失败不影响其他插件；每条订阅独立 try/catch
      safeSubscribe(hub, () => onLCP(handler));
      safeSubscribe(hub, () => onFCP(handler));
      safeSubscribe(hub, () => onCLS(handler));
      safeSubscribe(hub, () => onINP(handler));
      safeSubscribe(hub, () => onTTFB(handler));

      // 废弃指标自采集通道（可关）
      if (reportDeprecated) {
        safeSubscribe(hub, () => observeFID(hub));
        safeSubscribe(hub, () => observeTTI(hub, () => fcpValue));
      }

      // TBT 非废弃指标，单独开关
      if (reportTBT) {
        safeSubscribe(hub, () => observeTBT(hub, () => fcpValue));
      }
    },
  };
}

/** 读取首个 `PerformanceNavigationTiming` 并映射为内部结构 */
function readNavigationTiming(): NavigationTiming | null {
  if (typeof performance === "undefined" || !performance.getEntriesByType) {
    return null;
  }
  const entries = performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];
  const entry = entries[0];
  if (!entry) return null;
  return mapNavigationTiming(entry);
}

/**
 * 首屏时间（FSP / First Screen Paint）
 *
 * 与官方 FMP 语义一致但实现更简：取 `domContentLoadedEventEnd - startTime`，
 * 代表"DOM 结构完成 + 关键资源解析完毕"的时刻，作为"用户看到页面内容"的代理值。
 * 对于 SPA 首屏渲染由框架 hydration 主导的场景可能低估，后续 T2.1.4 可切换为
 * paint entries（`first-contentful-paint`）+ 框架 hook 组合判定。
 */
function readFspMs(): number | null {
  if (typeof performance === "undefined" || !performance.getEntriesByType) {
    return null;
  }
  const entries = performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];
  const entry = entries[0];
  if (!entry || entry.domContentLoadedEventEnd <= 0) return null;
  const value = Math.max(0, entry.domContentLoadedEventEnd - entry.startTime);
  return value > 0 ? Math.round(value) : null;
}

/** 构造 PerformanceEvent 并经 transport 发送 */
function dispatchMetric(
  hub: Hub,
  metric: Metric,
  navigation: NavigationTiming | undefined,
): void {
  const base = createBaseEvent(hub, "performance");
  const event: PerformanceEvent = {
    ...base,
    type: "performance",
    // SUPPORTED_METRICS 已过滤 FID；此处类型窄化后安全断言
    metric: metric.name as PerformanceEvent["metric"],
    value: Math.max(0, metric.value),
    rating: metric.rating,
    navigation,
  };
  hub.logger.debug(
    "performance dispatch",
    metric.name,
    metric.value,
    metric.rating,
  );
  void hub.transport.send(event);
}

/**
 * 合成事件分发（用于 FID / TTI 等非 web-vitals 通道）
 */
function dispatchSynthetic(
  hub: Hub,
  name: PerformanceEvent["metric"],
  value: number,
  rating: PerformanceEvent["rating"],
): void {
  const base = createBaseEvent(hub, "performance");
  const event: PerformanceEvent = {
    ...base,
    type: "performance",
    metric: name,
    value: Math.max(0, value),
    rating,
  };
  hub.logger.debug("performance dispatch (synthetic)", name, value, rating);
  void hub.transport.send(event);
}

/** 阈值 → web-vitals rating 语义 */
function ratingOf(
  value: number,
  thresholds: readonly [number, number],
): PerformanceEvent["rating"] {
  if (value <= thresholds[0]) return "good";
  if (value <= thresholds[1]) return "needs-improvement";
  return "poor";
}

/**
 * FID 自采集（已废弃指标，为面板完整性保留）
 *
 * web-vitals v4 已移除 onFID —— 直接通过 `PerformanceObserver({type:'first-input'})`
 * 读首条 `first-input` 条目，value = `processingStart - startTime`。
 * 由于用户交互不可控，可能整个页面周期都不触发 → 静默。
 */
function observeFID(hub: Hub): void {
  let reported = false;
  const po = new PerformanceObserver((list) => {
    if (reported) return;
    const entry = list.getEntries()[0] as PerformanceEventTiming | undefined;
    if (!entry) return;
    reported = true;
    po.disconnect();
    const value = Math.max(0, entry.processingStart - entry.startTime);
    dispatchSynthetic(hub, "FID", value, ratingOf(value, FID_RATING_THRESHOLDS));
  });
  // jsdom 等不支持 first-input 的环境会抛 TypeError，交由 safeSubscribe 吞掉
  po.observe({ type: "first-input", buffered: true });
}

/**
 * TTI 近似采集（已废弃指标，Google 已停止维护 tti-polyfill）
 *
 * 原始定义：从 FCP 开始，找到第一个 ≥5s 且无 long task 且网络请求 ≤2 的静默窗口；
 *           TTI = 窗口前最后一个 long task 的结束时间（若无 long task 则回退到 FCP）。
 *
 * 本实现简化（仅用 long task，忽略网络请求窗口）：
 * 1) 观察 `longtask` 条目，记录 `lastLongTaskEnd`
 * 2) `load` 事件后轮询 FCP 就绪 → 启动 5s quiet 定时器
 * 3) 每次新 long task 到达都重置定时器
 * 4) 定时器触发 → TTI = max(FCP, lastLongTaskEnd)，上报一次后断开观察
 *
 * 网络 <=2 请求的静默条件未纳入，可能在长轮询等场景偏乐观；对于一般页面足够可用。
 */
function observeTTI(hub: Hub, getFcp: () => number | null): void {
  let lastLongTaskEnd = 0;
  let reported = false;
  let startedWatch = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const po = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      const end = e.startTime + e.duration;
      if (end > lastLongTaskEnd) lastLongTaskEnd = end;
    }
    if (startedWatch && !reported) scheduleReport();
  });
  po.observe({ type: "longtask", buffered: true });

  const fire = (): void => {
    if (reported) return;
    reported = true;
    po.disconnect();
    if (timer) clearTimeout(timer);
    const fcp = getFcp() ?? 0;
    const value = Math.max(fcp, lastLongTaskEnd);
    dispatchSynthetic(hub, "TTI", value, ratingOf(value, TTI_RATING_THRESHOLDS));
  };

  const scheduleReport = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, TTI_QUIET_MS);
  };

  const tryStartWatch = (): boolean => {
    if (startedWatch) return true;
    if (getFcp() == null) return false;
    startedWatch = true;
    scheduleReport();
    return true;
  };

  const beginAfterLoad = (): void => {
    if (tryStartWatch()) return;
    let tries = 0;
    const pollId = setInterval(() => {
      tries += 1;
      if (tryStartWatch() || tries >= TTI_POLL_MAX || reported) {
        clearInterval(pollId);
      }
    }, TTI_POLL_INTERVAL_MS);
  };

  if (document.readyState === "complete") {
    beginAfterLoad();
  } else {
    window.addEventListener("load", beginAfterLoad, { once: true });
  }

  // 兜底：页面卸载前若尚未上报（长任务/FCP 缺失），也尝试一次发出，避免数据永远丢失
  window.addEventListener(
    "pagehide",
    () => {
      if (!reported) fire();
    },
    { once: true },
  );
}

/**
 * TBT 采集（Lighthouse 口径）
 *
 * 定义：TBT = Σ max(0, longTaskDuration - 50)，窗口为 FCP ~ TTI。
 *
 * 本实现简化（不依赖 TTI 结束点，改用 load + TBT_WINDOW_MS 作为窗口终点）：
 * 1) 观察 `longtask` 条目，累加 `max(0, duration - 50)`；若有 FCP，仅统计 `startTime ≥ fcp` 的任务
 * 2) `load` 事件后再等 TBT_WINDOW_MS（默认 5s）触发上报一次
 * 3) `pagehide` 兜底：提前离开页面时也尝试上报一次
 *
 * 与 Lighthouse 的差异：
 * - Lighthouse 用 TTI 作为窗口终点；本实现固定 5s 近似
 * - 在 FCP 未就绪时退化为统计所有 long task（兼容极端早期交互场景）
 */
function observeTBT(hub: Hub, getFcp: () => number | null): void {
  let totalBlockingMs = 0;
  let reported = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const po = new PerformanceObserver((list) => {
    const fcp = getFcp();
    for (const e of list.getEntries()) {
      if (fcp != null && e.startTime < fcp) continue;
      const blocking = e.duration - TBT_LONGTASK_BASE_MS;
      if (blocking > 0) totalBlockingMs += blocking;
    }
  });
  po.observe({ type: "longtask", buffered: true });

  const fire = (): void => {
    if (reported) return;
    reported = true;
    po.disconnect();
    if (timer) clearTimeout(timer);
    dispatchSynthetic(
      hub,
      "TBT",
      totalBlockingMs,
      ratingOf(totalBlockingMs, TBT_RATING_THRESHOLDS),
    );
  };

  const scheduleFire = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, TBT_WINDOW_MS);
  };

  if (document.readyState === "complete") {
    scheduleFire();
  } else {
    window.addEventListener("load", scheduleFire, { once: true });
  }

  // 兜底：页面卸载前尚未上报则立即发出
  window.addEventListener(
    "pagehide",
    () => {
      if (!reported) fire();
    },
    { once: true },
  );
}

/** 包裹 web-vitals 订阅调用，吞错以保证单指标失败不影响其他指标 */
function safeSubscribe(hub: Hub, subscribe: () => void): void {
  try {
    subscribe();
  } catch (err) {
    hub.logger.error("performance plugin: web-vitals 订阅失败", err);
  }
}
