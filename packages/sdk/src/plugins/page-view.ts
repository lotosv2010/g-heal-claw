/**
 * 页面访问采集插件
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
  /** 是否采集页面停留时长（visibilitychange/pagehide 离开时回写），默认 true */
  readonly trackDuration?: boolean;
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
  const trackDuration = opts.trackDuration ?? true;

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
      let lastEventId = "";
      let pageEnterAt = Date.now();

      // 页面离开时回写停留时长（使用相同 eventId，服务端 UPSERT duration_ms）
      const emitDuration = (): void => {
        if (!trackDuration || !lastEventId) return;
        const duration = Date.now() - pageEnterAt;
        if (duration < 100) return; // 忽略瞬间离开
        dispatchDuration(hub, {
          eventId: lastEventId,
          url: lastUrl,
          enterAt: pageEnterAt,
          duration,
        });
      };

      // 1) 初次加载上报
      const emitInitial = (): void => {
        const result = dispatch(hub, {
          url: lastUrl,
          loadType: detectLoadType(),
          isSpaNav: false,
        });
        lastEventId = result.eventId;
        pageEnterAt = result.enterAt;
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", emitInitial, {
          once: true,
        });
      } else {
        emitInitial();
      }

      // visibilitychange → hidden 时上报停留时长
      if (trackDuration) {
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") emitDuration();
        });
        window.addEventListener("pagehide", emitDuration);
      }

      if (!autoSpa) return;

      // 2) SPA 切换：popstate
      window.addEventListener("popstate", () => {
        const next = safeUrl();
        if (next === lastUrl) return;
        emitDuration(); // 离开旧页面，回写停留时长
        lastUrl = next;
        const result = dispatch(hub, {
          url: next,
          loadType: "back_forward",
          isSpaNav: true,
        });
        lastEventId = result.eventId;
        pageEnterAt = result.enterAt;
      });

      // 3) SPA 切换：patch pushState / replaceState
      patchHistory(hub, () => {
        const next = safeUrl();
        if (next === lastUrl) return;
        emitDuration(); // 离开旧页面
        lastUrl = next;
        const result = dispatch(hub, {
          url: next,
          loadType: "navigate",
          isSpaNav: true,
        });
        lastEventId = result.eventId;
        pageEnterAt = result.enterAt;
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

interface DispatchResult {
  readonly eventId: string;
  readonly enterAt: number;
}

function dispatch(hub: Hub, p: DispatchParams): DispatchResult {
  const now = Date.now();
  const base = createBaseEvent(hub, "page_view");
  const event: PageViewEvent = {
    ...base,
    type: "page_view",
    enterAt: now,
    loadType: p.loadType,
    isSpaNav: p.isSpaNav,
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
  return { eventId: base.eventId, enterAt: now };
}

/** 页面离开时重发相同 eventId + duration（服务端 UPSERT 回写） */
function dispatchDuration(hub: Hub, p: {
  eventId: string;
  url: string;
  enterAt: number;
  duration: number;
}): void {
  const base = createBaseEvent(hub, "page_view");
  const event: PageViewEvent = {
    ...base,
    eventId: p.eventId, // 复用原始 eventId 触发 UPSERT
    type: "page_view",
    enterAt: p.enterAt,
    leaveAt: Date.now(),
    duration: p.duration,
    loadType: "navigate",
    isSpaNav: false,
    page: {
      ...base.page,
      url: p.url,
      path: safePath(p.url),
    },
  };
  hub.logger.debug("page-view duration", p.url, p.duration, "ms");
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
