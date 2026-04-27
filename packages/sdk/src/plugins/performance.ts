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
}

/** Web Vitals `Metric.name` → `PerformanceEventSchema.metric` 的白名单（FID 不采） */
const SUPPORTED_METRICS = new Set<Metric["name"]>([
  "LCP",
  "FCP",
  "CLS",
  "INP",
  "TTFB",
]);

/**
 * SDK PerformancePlugin 工厂（ADR-0014）
 *
 * 订阅 `web-vitals` 的 LCP/FCP/CLS/INP/TTFB 回调，并在页面加载完成后
 * 通过 `PerformanceNavigationTiming` 采集瀑布阶段。所有事件统一映射到
 * `PerformanceEventSchema`（SPEC §4.2）单事件单指标上报。
 *
 * 失败场景静默降级（与 SDK 对宿主透明原则一致）：
 * - 非浏览器环境（无 `window` / `document`）→ 直接 return
 * - 无 `PerformanceObserver` → 打 warn 并 return（web-vitals 本身依赖它）
 * - web-vitals 订阅异常 → logger 记录但不抛
 */
export function performancePlugin(
  opts: PerformancePluginOptions = {},
): Plugin {
  const reportNavigation = opts.reportNavigation ?? true;

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
      if (reportNavigation) {
        if (document.readyState === "complete") {
          pendingNavigation = readNavigationTiming();
        } else {
          window.addEventListener(
            "load",
            () => {
              pendingNavigation = readNavigationTiming();
            },
            { once: true },
          );
        }
      }

      // Web Vitals 订阅
      const handler = (metric: Metric): void => {
        if (!SUPPORTED_METRICS.has(metric.name)) return;
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

/** 包裹 web-vitals 订阅调用，吞错以保证单指标失败不影响其他指标 */
function safeSubscribe(hub: Hub, subscribe: () => void): void {
  try {
    subscribe();
  } catch (err) {
    hub.logger.error("performance plugin: web-vitals 订阅失败", err);
  }
}
