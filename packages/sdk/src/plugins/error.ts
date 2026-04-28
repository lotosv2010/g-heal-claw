import type {
  Breadcrumb,
  ErrorEvent as GhcErrorEvent,
  ResourceKind,
  StackFrame,
} from "@g-heal-claw/shared";
import { createBaseEvent } from "../event.js";
import type { Hub } from "../hub.js";
import type { Plugin } from "../plugin.js";
import { parseStack } from "./stack-parser.js";

/**
 * ErrorPlugin 配置（ADR-0016 §1）
 */
export interface ErrorPluginOptions {
  /** 是否捕获资源错误（img/script/link/audio/video 等），默认 true */
  readonly captureResource?: boolean;
  /** message 命中即丢弃（字符串子串匹配 / 正则 test） */
  readonly ignoreErrors?: ReadonlyArray<string | RegExp>;
}

/**
 * 资源错误的标签白名单：只有这些 tag 的 error 事件视为"资源加载失败"
 *
 * 注：audio/video 的 error 更常来自媒体解码而非网络，但 MVP 统一按资源处理
 */
const RESOURCE_TAGS = new Set([
  "IMG",
  "SCRIPT",
  "LINK",
  "AUDIO",
  "VIDEO",
  "SOURCE",
  "IFRAME",
]);

/**
 * SDK ErrorPlugin 工厂（ADR-0016）
 *
 * 订阅三路原生事件并映射到 `ErrorEventSchema`：
 *  - `window.addEventListener("error", h, false)` → JS 异常（冒泡阶段）
 *  - `window.addEventListener("error", h, true)`  → 资源错误（捕获阶段）
 *  - `window.addEventListener("unhandledrejection", h)` → Promise rejection
 *
 * 所有订阅共用一个 `WeakSet<Event>` 去重；非浏览器环境静默降级。
 * 不修改宿主页面已有的 `window.onerror`（只用 addEventListener）。
 */
export function errorPlugin(opts: ErrorPluginOptions = {}): Plugin {
  const captureResource = opts.captureResource ?? true;
  const ignoreErrors = opts.ignoreErrors ?? [];

  return {
    name: "error",
    setup(hub) {
      if (typeof window === "undefined" || typeof document === "undefined") {
        hub.logger.debug("error plugin: 非浏览器环境，跳过");
        return;
      }

      const seen = new WeakSet<Event>();

      const onError = (event: Event): void => {
        try {
          if (seen.has(event)) return;
          seen.add(event);

          // 资源错误：Event.target 是带 src/href 的 Element
          const target = event.target as (HTMLElement & {
            src?: string;
            href?: string;
          }) | null;
          const isResource =
            !!target && target.tagName && RESOURCE_TAGS.has(target.tagName);

          if (isResource) {
            if (!captureResource) return;
            dispatchResource(hub, target);
            return;
          }

          // JS 异常：ErrorEvent 接口
          const errEvent = event as ErrorEvent;
          const err = errEvent.error;
          const message = errEvent.message || (err?.message ?? "Unknown error");
          if (shouldIgnore(message, ignoreErrors)) return;
          dispatchJs(hub, message, err);
        } catch (unexpected) {
          hub.logger.error("error plugin: onError 内部异常", unexpected);
        }
      };

      const onRejection = (event: PromiseRejectionEvent): void => {
        try {
          if (seen.has(event)) return;
          seen.add(event);
          const reason = event.reason;
          const { message, stack } = normalizeReason(reason);
          if (shouldIgnore(message, ignoreErrors)) return;
          dispatchPromise(hub, message, stack);
        } catch (unexpected) {
          hub.logger.error("error plugin: onRejection 内部异常", unexpected);
        }
      };

      // 冒泡阶段：JS 异常
      window.addEventListener("error", onError, false);
      // 捕获阶段：资源错误（资源 error 不冒泡）
      if (captureResource) {
        window.addEventListener("error", onError, true);
      }
      window.addEventListener("unhandledrejection", onRejection);
    },
  };
}

// ---- 分发 ----

function dispatchJs(hub: Hub, message: string, err: Error | undefined): void {
  const stack = err?.stack;
  const event: GhcErrorEvent = {
    ...createBaseEvent(hub, "error"),
    type: "error",
    subType: "js",
    message,
    stack,
    frames: safeParseFrames(stack),
    breadcrumbs: snapshotBreadcrumbs(hub),
  };
  hub.logger.debug("error dispatch js", message);
  void hub.transport.send(event);
}

function dispatchPromise(
  hub: Hub,
  message: string,
  stack: string | undefined,
): void {
  const event: GhcErrorEvent = {
    ...createBaseEvent(hub, "error"),
    type: "error",
    subType: "promise",
    message,
    stack,
    frames: safeParseFrames(stack),
    breadcrumbs: snapshotBreadcrumbs(hub),
  };
  hub.logger.debug("error dispatch promise", message);
  void hub.transport.send(event);
}

function dispatchResource(
  hub: Hub,
  target: HTMLElement & { src?: string; href?: string },
): void {
  const url = target.src ?? target.href ?? "";
  const tagName = target.tagName.toLowerCase();
  // outerHTML 可能极长（复杂 SVG/iframe），MVP 截断
  const outerHTML = safeOuterHtml(target).slice(0, 512);
  const kind = classifyResource(tagName, url);
  const event: GhcErrorEvent = {
    ...createBaseEvent(hub, "error"),
    type: "error",
    subType: "resource",
    message: `Resource load failed: <${tagName}> ${url || "(no src)"}`,
    resource: { url, tagName, kind, outerHTML },
    breadcrumbs: snapshotBreadcrumbs(hub),
  };
  hub.logger.debug("error dispatch resource", tagName, kind, url);
  void hub.transport.send(event);
}

/**
 * 资源分类：依据 tagName + URL 后缀决定 9 分类卡片归属
 *
 * - script / iframe    → js_load
 * - link[rel=css] / .css → css_load
 * - img / picture      → image_load
 * - audio / video / source → media
 * - 其他               → other（服务端落库时仍保留）
 */
function classifyResource(tagName: string, url: string): ResourceKind {
  const tag = tagName.toLowerCase();
  const pathname = extractPath(url).toLowerCase();
  if (tag === "script" || pathname.endsWith(".js") || pathname.endsWith(".mjs"))
    return "js_load";
  if (
    tag === "link" ||
    pathname.endsWith(".css")
  )
    return "css_load";
  if (tag === "img" || tag === "picture") return "image_load";
  if (
    tag === "audio" ||
    tag === "video" ||
    tag === "source" ||
    pathname.endsWith(".mp4") ||
    pathname.endsWith(".webm") ||
    pathname.endsWith(".mp3") ||
    pathname.endsWith(".m4a") ||
    pathname.endsWith(".ogg") ||
    pathname.endsWith(".wav")
  )
    return "media";
  return "other";
}

function extractPath(url: string): string {
  try {
    // URL 解析允许相对路径，缺省使用 location.origin 兜底
    const base =
      typeof location !== "undefined" ? location.origin : "http://localhost";
    return new URL(url, base).pathname;
  } catch {
    return url;
  }
}

// ---- 工具 ----

function normalizeReason(reason: unknown): {
  message: string;
  stack?: string;
} {
  if (reason instanceof Error) {
    return { message: reason.message || String(reason), stack: reason.stack };
  }
  if (typeof reason === "string") return { message: reason };
  try {
    return { message: JSON.stringify(reason) };
  } catch {
    return { message: String(reason) };
  }
}

function shouldIgnore(
  message: string,
  patterns: ReadonlyArray<string | RegExp>,
): boolean {
  for (const p of patterns) {
    if (typeof p === "string") {
      if (message.includes(p)) return true;
    } else if (p.test(message)) {
      return true;
    }
  }
  return false;
}

function safeParseFrames(stack: string | undefined): StackFrame[] | undefined {
  const frames = parseStack(stack);
  return frames.length > 0 ? frames : undefined;
}

function snapshotBreadcrumbs(hub: Hub): Breadcrumb[] | undefined {
  const arr = hub.scope.breadcrumbs;
  return arr.length > 0 ? [...arr].slice(-50) : undefined;
}

function safeOuterHtml(el: HTMLElement): string {
  try {
    return el.outerHTML ?? "";
  } catch {
    return "";
  }
}
