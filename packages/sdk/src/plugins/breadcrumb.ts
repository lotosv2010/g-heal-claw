import type { Breadcrumb } from "@g-heal-claw/shared";
import type { Hub } from "../hub.js";
import type { Plugin } from "../plugin.js";

/**
 * Breadcrumb 自动采集插件（ADR-0034 T1.2.3）
 *
 * 采集 5 种 category 的用户轨迹，写入 Hub.scope.breadcrumbs 环形缓冲。
 * 当 error 事件上报时，breadcrumbs 快照附加到事件 payload。
 *
 * 与 httpPlugin/apiPlugin 的关系：breadcrumb 仅记录轨迹（不上报独立事件）。
 */

export interface BreadcrumbPluginOptions {
  /** 是否采集路由切换，默认 true */
  readonly navigation?: boolean;
  /** 是否采集点击，默认 true */
  readonly click?: boolean;
  /** 是否采集 console，默认 true */
  readonly console?: boolean;
  /** 是否采集 fetch/XHR，默认 true */
  readonly fetch?: boolean;
  /** click text 最大长度，默认 80 */
  readonly maxClickTextLength?: number;
  /** console args 截断长度，默认 200 */
  readonly maxConsoleArgLength?: number;
}

export function breadcrumbPlugin(opts: BreadcrumbPluginOptions = {}): Plugin {
  return {
    name: "breadcrumb",
    setup(hub) {
      if (typeof window === "undefined") return;

      if (opts.navigation !== false) setupNavigation(hub);
      if (opts.click !== false) setupClick(hub, opts.maxClickTextLength ?? 80);
      if (opts.console !== false) setupConsole(hub, opts.maxConsoleArgLength ?? 200);
      if (opts.fetch !== false) setupFetchXhr(hub);
    },
  };
}

// ---- navigation ----

function setupNavigation(hub: Hub): void {
  let lastUrl = location.href;

  const record = (): void => {
    const to = location.href;
    if (to === lastUrl) return;
    const from = lastUrl;
    lastUrl = to;
    add(hub, {
      timestamp: Date.now(),
      category: "navigation",
      level: "info",
      message: `${from} → ${to}`,
      data: { from, to },
    });
  };

  // patch pushState / replaceState
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = function (...args) {
    origPush(...args);
    record();
  };
  history.replaceState = function (...args) {
    origReplace(...args);
    record();
  };
  window.addEventListener("popstate", record);
}

// ---- click ----

function setupClick(hub: Hub, maxText: number): void {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const selector = buildSelector(target);
      const text = (target.textContent ?? "").trim().slice(0, maxText);
      const href = (target as HTMLAnchorElement).href ?? undefined;
      add(hub, {
        timestamp: Date.now(),
        category: "click",
        level: "info",
        message: selector,
        data: { selector, text, href },
      });
    },
    { capture: true, passive: true },
  );
}

function buildSelector(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls = el.className && typeof el.className === "string"
    ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
    : "";
  return `${tag}${id}${cls}`;
}

// ---- console ----

function setupConsole(hub: Hub, maxArgLen: number): void {
  const levels = ["log", "warn", "error"] as const;
  for (const level of levels) {
    const orig = console[level];
    if (!orig) continue;
    console[level] = function (...args: unknown[]) {
      orig.apply(console, args);
      const truncated = args.map((a) => truncateArg(a, maxArgLen));
      add(hub, {
        timestamp: Date.now(),
        category: "console",
        level: level === "log" ? "info" : level === "warn" ? "warning" : "error",
        message: truncated.join(" "),
        data: { level, args: truncated },
      });
    };
  }
}

function truncateArg(arg: unknown, maxLen: number): string {
  try {
    const s = typeof arg === "string" ? arg : JSON.stringify(arg) ?? String(arg);
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
  } catch {
    return "[unserializable]";
  }
}

// ---- fetch / XHR ----

function setupFetchXhr(hub: Hub): void {
  // fetch patch
  if (typeof fetch !== "undefined") {
    const origFetch = fetch;
    (globalThis as Record<string, unknown>).fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const method = init?.method ?? "GET";
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      const start = Date.now();
      try {
        const res = await origFetch(input, init);
        add(hub, {
          timestamp: Date.now(),
          category: "fetch",
          level: res.ok ? "info" : "warning",
          message: `${method} ${url} ${res.status}`,
          data: { method, url, status: res.status, durationMs: Date.now() - start },
        });
        return res;
      } catch (err) {
        add(hub, {
          timestamp: Date.now(),
          category: "fetch",
          level: "error",
          message: `${method} ${url} failed`,
          data: { method, url, status: 0, durationMs: Date.now() - start },
        });
        throw err;
      }
    } as typeof fetch;
  }

  // XHR patch
  if (typeof XMLHttpRequest !== "undefined") {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      (this as unknown as Record<string, unknown>).__ghcBcMethod = method;
      (this as unknown as Record<string, unknown>).__ghcBcUrl = String(url);
      (this as unknown as Record<string, unknown>).__ghcBcStart = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return origOpen.call(this, method, url, ...(rest as [any, any, any]));
    };

    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args) {
      this.addEventListener("loadend", () => {
        const meta = this as unknown as Record<string, unknown>;
        add(hub, {
          timestamp: Date.now(),
          category: "xhr",
          level: this.status >= 400 || this.status === 0 ? "warning" : "info",
          message: `${meta.__ghcBcMethod} ${meta.__ghcBcUrl} ${this.status}`,
          data: {
            method: meta.__ghcBcMethod,
            url: meta.__ghcBcUrl,
            status: this.status,
            durationMs: Date.now() - (meta.__ghcBcStart as number),
          },
        });
      });
      return origSend.apply(this, args);
    };
  }
}

// ---- helper ----

function add(hub: Hub, bc: Breadcrumb): void {
  hub.addBreadcrumb(bc);
}
