/**
 * 页面访问采集插件（ADR-0020 Tier 2.A / SPEC §3.3.5）
 *
 * 职责：采集页面加载 + SPA 路由切换，映射到 `PageViewEventSchema`（`type: 'page_view'`）
 *  - 初次加载：`DOMContentLoaded` 或立即触发，loadType 读自 Performance Navigation API
 *  - SPA 切换：monkey-patch `history.pushState` / `history.replaceState` + 监听 `popstate`
 *
 * 与 trackPlugin 的分工：
 *  - trackPlugin：采 click / submit / expose 等交互埋点
 *  - pageViewPlugin：仅采"进入了哪个页面 URL"，面向 PV/UV/TopPages 聚合
 *
 * 设计约束：
 *  - SSR 降级：非浏览器环境 / history 不可用 → 跳过
 *  - 零阻塞：所有事件均通过 `hub.transport.send` 异步吞错
 *  - 幂等 patch：重复 setup 不会重复 wrap `pushState/replaceState`
 *  - 去重：同 URL 连续 dispatch 会被合并（避免 replaceState 刷 URL 时重复上报）
 */
import type { PageViewEvent } from "@g-heal-claw/shared";
import { createBaseEvent } from "../event.js";
import type { Hub } from "../hub.js";
import type { Plugin } from "../plugin.js";

export interface PageViewPluginOptions {
  /** 是否启用采集，默认 true */
  readonly enabled?: boolean;
  /**
   * 是否自动采 SPA 路由切换（patch pushState / replaceState + popstate）
   *
   * 默认 true；关闭后只采初次硬刷新
   */
  readonly autoSpa?: boolean;
}

interface PatchMarker {
  __ghcPageViewPatched?: boolean;
}

type LoadType = PageViewEvent["loadType"];

/**
 * pageViewPlugin 工厂
 */
export function pageViewPlugin(opts: PageViewPluginOptions = {}): Plugin {
  const enabled = opts.enabled ?? true;
  const autoSpa = opts.autoSpa ?? true;

  return {
    name: "page-view",
    setup(hub) {
      if (!enabled) {
        hub.logger.debug("page-view plugin: 禁用");
        return;
      }
      if (typeof window === "undefined" || typeof document === "undefined") {
        hub.logger.debug("page-view plugin: 非浏览器环境，跳过");
        return;
      }

      let lastUrl = safeUrl();

      // 1) 初次加载上报：DOM 已就绪立即触发，未就绪则监听一次
      const emitInitial = (): void => {
        dispatch(hub, {
          url: lastUrl,
          loadType: detectLoadType(),
          isSpaNav: false,
        });
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", emitInitial, {
          once: true,
        });
      } else {
        emitInitial();
      }

      if (!autoSpa) return;

      // 2) SPA 切换：popstate（前进/后退）
      window.addEventListener("popstate", () => {
        const next = safeUrl();
        if (next === lastUrl) return;
        lastUrl = next;
        dispatch(hub, {
          url: next,
          loadType: "back_forward",
          isSpaNav: true,
        });
      });

      // 3) SPA 切换：patch pushState / replaceState（幂等）
      patchHistory(hub, () => {
        const next = safeUrl();
        if (next === lastUrl) return;
        lastUrl = next;
        dispatch(hub, {
          url: next,
          loadType: "navigate",
          isSpaNav: true,
        });
      });
    },
  };
}

// ---- history patch ----

function patchHistory(hub: Hub, onChange: () => void): void {
  const marker = history as PatchMarker & History;
  if (marker.__ghcPageViewPatched) return;

  const originalPush = history.pushState;
  const originalReplace = history.replaceState;

  history.pushState = function pushStatePatched(
    this: History,
    ...args: Parameters<History["pushState"]>
  ): void {
    const ret = originalPush.apply(this, args);
    try {
      onChange();
    } catch (err) {
      hub.logger.warn("page-view: pushState onChange failed", err);
    }
    return ret;
  };

  history.replaceState = function replaceStatePatched(
    this: History,
    ...args: Parameters<History["replaceState"]>
  ): void {
    const ret = originalReplace.apply(this, args);
    try {
      onChange();
    } catch (err) {
      hub.logger.warn("page-view: replaceState onChange failed", err);
    }
    return ret;
  };

  marker.__ghcPageViewPatched = true;
}

// ---- 分发 ----

interface DispatchParams {
  readonly url: string;
  readonly loadType: LoadType;
  readonly isSpaNav: boolean;
}

function dispatch(hub: Hub, p: DispatchParams): void {
  const now = Date.now();
  const base = createBaseEvent(hub, "page_view");
  const event: PageViewEvent = {
    ...base,
    type: "page_view",
    enterAt: now,
    loadType: p.loadType,
    isSpaNav: p.isSpaNav,
    // 覆盖 page.url / page.path 以匹配当前导航目标（createBaseEvent 里的 collectPage 也会
    // 取同一时刻的 location，这里显式一层是为了 SPA 切换后与 dispatch 强一致）
    page: {
      ...base.page,
      url: p.url,
      path: safePath(p.url),
    },
  };
  hub.logger.debug(
    "page-view dispatch",
    p.loadType,
    p.isSpaNav ? "spa" : "hard",
    p.url,
  );
  void hub.transport.send(event);
}

// ---- 工具 ----

function safeUrl(): string {
  try {
    return window.location.href;
  } catch {
    return "";
  }
}

function safePath(url: string): string {
  try {
    return new URL(url, "http://unknown.local").pathname;
  } catch {
    return "/";
  }
}

/**
 * 识别加载类型：优先用 Performance Navigation API v2（PerformanceNavigationTiming）
 * 回退到 v1（performance.navigation.type），均无 → navigate 兜底
 */
function detectLoadType(): LoadType {
  try {
    const entries =
      typeof performance !== "undefined" &&
      typeof performance.getEntriesByType === "function"
        ? (performance.getEntriesByType(
            "navigation",
          ) as PerformanceNavigationTiming[])
        : [];
    const first = entries[0];
    if (first) {
      // 用字符串宽化，规避不同 lib.dom 版本对 NavigationTimingType 字面量收紧差异
      const t = String(first.type);
      if (t === "reload") return "reload";
      if (t === "back_forward") return "back_forward";
      if (t === "prerender") return "prerender";
      return "navigate";
    }
    const legacy = (performance as { navigation?: { type: number } }).navigation;
    if (legacy) {
      switch (legacy.type) {
        case 1:
          return "reload";
        case 2:
          return "back_forward";
        default:
          return "navigate";
      }
    }
  } catch {
    /* ignore */
  }
  return "navigate";
}
