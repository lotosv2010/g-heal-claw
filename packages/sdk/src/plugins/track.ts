/**
 * 埋点采集插件（P0-3 §3 / SPEC §3.3.7）
 *
 * 职责：采集 4 类埋点事件，映射到 `TrackEventSchema`（`type: 'track'`）
 *  - click   全埋点：document 捕获 click；命中 data-track / [data-track-id] 或显式 selector
 *  - submit  全埋点：form 提交（capture 阶段）
 *  - expose  曝光：IntersectionObserver 监听 [data-track-expose] 元素，500ms 停留触发一次
 *  - code    代码埋点：GHealClaw.track(name, props)
 *
 * 设计约束：
 *  - SSR 降级：非浏览器环境 → 跳过
 *  - 零阻塞：所有事件均通过 `hub.transport.send` 异步吞错
 *  - 幂等挂载：重复 setup 不会重复绑定监听
 *  - click / submit 默认节流：同一 selector 1s 内最多一次（避免误触发连击）
 */
import type { TrackEvent } from "@g-heal-claw/shared";
import { createBaseEvent } from "../event.js";
import type { Hub } from "../hub.js";
import type { Plugin } from "../plugin.js";

/** track 主动埋点导出：init 后可调用 GHealClaw.track(name, props) */
export interface TrackApi {
  (name: string, properties?: Record<string, unknown>): void;
}

export interface TrackPluginOptions {
  /** 是否启用采集，默认 true */
  readonly enabled?: boolean;
  /** 是否启用全埋点点击，默认 true（仅在元素带 data-track / data-track-id 时触发） */
  readonly captureClick?: boolean;
  /** 是否启用表单 submit 采集，默认 true */
  readonly captureSubmit?: boolean;
  /** 是否启用曝光采集（IntersectionObserver），默认 true */
  readonly captureExpose?: boolean;
  /** 曝光所需停留毫秒，默认 500 */
  readonly exposeDwellMs?: number;
  /** 节流窗口（毫秒），默认 1000；同 selector 窗口内最多一次 */
  readonly throttleMs?: number;
}

interface ResolvedOptions {
  readonly captureClick: boolean;
  readonly captureSubmit: boolean;
  readonly captureExpose: boolean;
  readonly exposeDwellMs: number;
  readonly throttleMs: number;
}

interface GlobalPatchMarker {
  __ghcTrackPatched?: boolean;
}

let sharedHub: Hub | undefined;

/**
 * trackPlugin 工厂
 */
export function trackPlugin(opts: TrackPluginOptions = {}): Plugin {
  const enabled = opts.enabled ?? true;
  const resolved: ResolvedOptions = {
    captureClick: opts.captureClick ?? true,
    captureSubmit: opts.captureSubmit ?? true,
    captureExpose: opts.captureExpose ?? true,
    exposeDwellMs: opts.exposeDwellMs ?? 500,
    throttleMs: opts.throttleMs ?? 1000,
  };

  return {
    name: "track",
    setup(hub) {
      if (!enabled) {
        hub.logger.debug("track plugin: 禁用");
        return;
      }
      if (typeof window === "undefined" || typeof document === "undefined") {
        hub.logger.debug("track plugin: 非浏览器环境，跳过");
        return;
      }
      const g = window as typeof window & GlobalPatchMarker;
      if (g.__ghcTrackPatched) {
        hub.logger.debug("track plugin: 已挂载，跳过重复 setup");
        sharedHub = hub;
        return;
      }
      g.__ghcTrackPatched = true;
      sharedHub = hub;

      if (resolved.captureClick) bindClick(hub, resolved);
      if (resolved.captureSubmit) bindSubmit(hub, resolved);
      if (resolved.captureExpose) bindExpose(hub, resolved);
    },
  };
}

// ---- 主动埋点 API ----

/**
 * 代码埋点：`GHealClaw.track("login_click", { from: "home" })`
 *
 * 必须在 `init` 之后调用；未初始化时静默丢弃。
 */
export function track(
  name: string,
  properties?: Record<string, unknown>,
): void {
  const hub = sharedHub;
  if (!hub) return;
  const safeName = (name ?? "").trim();
  if (!safeName) return;
  dispatch(hub, {
    trackType: "code",
    target: { selector: safeName },
    properties: { ...(properties ?? {}), __name: safeName },
  });
}

// ---- click 全埋点 ----

function bindClick(hub: Hub, opts: ResolvedOptions): void {
  const throttle = createThrottle(opts.throttleMs);
  document.addEventListener(
    "click",
    (ev) => {
      const target = ev.target as Element | null;
      if (!target || !(target instanceof Element)) return;
      const el = resolveTrackableElement(target);
      if (!el) return;
      const descriptor = describeElement(el);
      if (!throttle(descriptor.selector)) return;
      dispatch(hub, {
        trackType: "click",
        target: descriptor,
        properties: parseDataset(el),
      });
    },
    true,
  );
}

// ---- submit 全埋点 ----

function bindSubmit(hub: Hub, opts: ResolvedOptions): void {
  const throttle = createThrottle(opts.throttleMs);
  document.addEventListener(
    "submit",
    (ev) => {
      const target = ev.target as Element | null;
      if (!(target instanceof HTMLFormElement)) return;
      const descriptor = describeElement(target);
      if (!throttle(descriptor.selector)) return;
      dispatch(hub, {
        trackType: "submit",
        target: descriptor,
        properties: parseDataset(target),
      });
    },
    true,
  );
}

// ---- expose 曝光 ----

function bindExpose(hub: Hub, opts: ResolvedOptions): void {
  if (typeof IntersectionObserver === "undefined") {
    hub.logger.debug("track plugin: 不支持 IntersectionObserver，跳过曝光");
    return;
  }
  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
  const fired = new WeakSet<Element>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target;
        if (entry.isIntersecting) {
          if (fired.has(el)) continue;
          const timer = setTimeout(() => {
            if (!fired.has(el)) {
              fired.add(el);
              dispatch(hub, {
                trackType: "expose",
                target: describeElement(el),
                properties: parseDataset(el),
              });
            }
          }, opts.exposeDwellMs);
          timers.set(el, timer);
        } else {
          const existing = timers.get(el);
          if (existing) {
            clearTimeout(existing);
            timers.delete(el);
          }
        }
      }
    },
    { threshold: 0.5 },
  );

  // 首次扫描 + MutationObserver 增量监听
  scanExposeTargets(document.body, observer);
  const mutationObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node instanceof Element) scanExposeTargets(node, observer);
      });
    }
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

function scanExposeTargets(root: Element, observer: IntersectionObserver): void {
  if (root.matches?.("[data-track-expose]")) observer.observe(root);
  const list = root.querySelectorAll?.("[data-track-expose]");
  list?.forEach((el) => observer.observe(el));
}

// ---- 工具 ----

interface ElementDescriptor {
  tag?: string;
  id?: string;
  className?: string;
  selector: string;
  text?: string;
}

/**
 * click 命中判定：
 *  - 自身或祖先具备 [data-track] / [data-track-id]
 *  - 或本身是 <button> / <a> 且带非空 text（默认启用可能过量，此处保守：
 *    仅 data-track 显式标注才采集，避免噪声）
 */
function resolveTrackableElement(el: Element): Element | null {
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement) {
    if (
      cur.hasAttribute("data-track") ||
      cur.hasAttribute("data-track-id")
    ) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

function describeElement(el: Element): ElementDescriptor {
  const tag = el.tagName.toLowerCase();
  const id = el.id || undefined;
  const className =
    typeof (el as HTMLElement).className === "string"
      ? ((el as HTMLElement).className as string).trim() || undefined
      : undefined;
  const trackId =
    el.getAttribute("data-track-id") ?? el.getAttribute("data-track") ?? undefined;
  const selector =
    trackId || (id ? `#${id}` : className ? `${tag}.${className.split(/\s+/)[0]}` : tag);
  const text = (el.textContent ?? "").trim().slice(0, 200) || undefined;
  return { tag, id, className, selector, text };
}

/** 解析 data-track-* 扁平属性为 properties */
function parseDataset(el: Element): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!(el instanceof HTMLElement)) return out;
  const data = el.dataset;
  for (const key of Object.keys(data)) {
    // data-track-id 已作为 selector 单独处理，不重复
    if (key === "trackId" || key === "track") continue;
    if (!key.startsWith("track")) continue;
    const normalized = key.slice("track".length);
    if (!normalized) continue;
    out[normalized.charAt(0).toLowerCase() + normalized.slice(1)] = data[key];
  }
  return out;
}

function createThrottle(windowMs: number): (key: string) => boolean {
  const last = new Map<string, number>();
  return (key) => {
    const now = Date.now();
    const prev = last.get(key) ?? 0;
    if (now - prev < windowMs) return false;
    last.set(key, now);
    return true;
  };
}

// ---- 分发 ----

interface DispatchParams {
  readonly trackType: TrackEvent["trackType"];
  readonly target: ElementDescriptor;
  readonly properties: Record<string, unknown>;
}

function dispatch(hub: Hub, p: DispatchParams): void {
  const event: TrackEvent = {
    ...createBaseEvent(hub, "track"),
    type: "track",
    trackType: p.trackType,
    target: {
      tag: p.target.tag,
      id: p.target.id,
      className: p.target.className,
      selector: p.target.selector,
      text: p.target.text,
    },
    properties: p.properties,
  };
  hub.logger.debug(
    "track dispatch",
    p.trackType,
    p.target.selector,
    Object.keys(p.properties).length,
  );
  void hub.transport.send(event);
}
