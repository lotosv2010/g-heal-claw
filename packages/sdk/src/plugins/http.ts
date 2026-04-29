import type {
  ErrorEvent as GhcErrorEvent,
  ErrorRequest,
} from "@g-heal-claw/shared";
import { createBaseEvent } from "../event.js";
import type { Hub } from "../hub.js";
import type { Plugin } from "../plugin.js";
import {
  isIgnored,
  isInternal,
  safeJson,
  safeNow,
  snapshotBreadcrumbs,
  toUrl,
} from "./http-capture.js";

/**
 * HTTP 采集插件 —— fetch + XHR Monkey Patch
 *
 * 上报规则（对齐 SPEC 9 分类）：
 *  - 网络层失败（fetch 抛错 / XHR onerror / ontimeout / status=0） → `subType: "ajax"`
 *  - HTTP 响应非 2xx                                            → `subType: "ajax"`
 *  - HTTP 2xx 但 `apiCodeFilter` 判定业务 code 异常                → `subType: "api_code"`
 *
 * 过滤：
 *  - `ignoreUrls` 命中的 URL 不上报（常用于隔离 SDK 自身 /ingest 回调）
 *  - SDK 自身的 ingest 请求（DSN.ingestUrl 开头）始终忽略，避免上报风暴
 *
 * 设计约束：
 *  - 零副作用：多次 setup 不会重复 patch（用标记位 `__ghcHttpPatched`）
 *  - 静默降级：非浏览器环境 / window.fetch 不存在 → 跳过
 */

export interface HttpCaptureOptions {
  /** 是否捕获 fetch/XHR 调用，默认 true */
  readonly captureRequests?: boolean;
  /** 业务 code 判定函数 —— 返回 true 表示命中 api_code 异常 */
  readonly apiCodeFilter?: (ctx: ApiCodeContext) => boolean;
  /** URL 黑名单（字符串子串或正则） */
  readonly ignoreUrls?: ReadonlyArray<string | RegExp>;
  /** 记录到 api_code 事件的 body 最大字节数，默认 2048 */
  readonly bodyMaxBytes?: number;
}

export interface ApiCodeContext {
  readonly url: string;
  readonly method: string;
  readonly status: number;
  readonly durationMs: number;
  /** JSON 解析后的响应体（解析失败则为 null） */
  readonly json: unknown;
  /** 原始响应体文本（已按 bodyMaxBytes 截断） */
  readonly text: string;
}

interface PatchMarker {
  __ghcHttpPatched?: boolean;
}

/**
 * 注：`httpPlugin` 与 `apiPlugin` 各自维护独立的 patch 标记
 * （`__ghcHttpPatched` / `__ghcApiPatched`），允许两者同时启用并串联调用。
 */

/**
 * HttpPlugin 工厂
 *
 * 默认 `apiCodeFilter` 兜底：响应 JSON 中 `code` 字段为数字且非 0 视为异常。
 */
export function httpPlugin(opts: HttpCaptureOptions = {}): Plugin {
  const enabled = opts.captureRequests ?? true;
  const filter = opts.apiCodeFilter ?? defaultApiCodeFilter;
  const ignoreUrls = opts.ignoreUrls ?? [];
  const bodyMax = opts.bodyMaxBytes ?? 2048;

  return {
    name: "http",
    setup(hub) {
      if (!enabled) {
        hub.logger.debug("http plugin: 禁用 captureRequests");
        return;
      }
      if (typeof window === "undefined") {
        hub.logger.debug("http plugin: 非浏览器环境，跳过");
        return;
      }

      patchFetch(hub, { filter, ignoreUrls, bodyMax });
      patchXhr(hub, { filter, ignoreUrls, bodyMax });
    },
  };
}

// ---- fetch patch ----

interface PatchContext {
  readonly filter: (ctx: ApiCodeContext) => boolean;
  readonly ignoreUrls: ReadonlyArray<string | RegExp>;
  readonly bodyMax: number;
}

function patchFetch(hub: Hub, ctx: PatchContext): void {
  const original = (window as { fetch?: typeof fetch }).fetch;
  if (!original) return;
  const marker = original as PatchMarker & typeof fetch;
  if (marker.__ghcHttpPatched) return;

  const wrapped = async function patched(
    this: unknown,
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = toUrl(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const start = safeNow();
    // SDK 自身上报 & 黑名单 URL 不进入采集
    if (isInternal(hub, url) || isIgnored(url, ctx.ignoreUrls)) {
      return original.call(this, input, init);
    }

    try {
      const response = await original.call(this, input, init);
      const duration = safeNow() - start;
      await inspectResponse(hub, {
        url,
        method,
        duration,
        response,
        filter: ctx.filter,
        bodyMax: ctx.bodyMax,
      });
      return response;
    } catch (err) {
      const duration = safeNow() - start;
      dispatchAjax(hub, {
        url,
        method,
        status: 0,
        statusText: (err as Error)?.message ?? "fetch error",
        durationMs: duration,
      });
      throw err;
    }
  };
  (wrapped as PatchMarker).__ghcHttpPatched = true;
  (window as { fetch?: typeof fetch }).fetch = wrapped as typeof fetch;
}

async function inspectResponse(
  hub: Hub,
  params: {
    readonly url: string;
    readonly method: string;
    readonly duration: number;
    readonly response: Response;
    readonly filter: (ctx: ApiCodeContext) => boolean;
    readonly bodyMax: number;
  },
): Promise<void> {
  const { response, url, method, duration, filter, bodyMax } = params;
  // 非 2xx 直接记 ajax（clone 以免干扰业务消费）
  if (!response.ok) {
    dispatchAjax(hub, {
      url,
      method,
      status: response.status,
      statusText: response.statusText,
      durationMs: duration,
    });
    return;
  }

  // 仅当响应疑似 JSON 时才尝试解析业务 code，避免拖慢非 JSON 场景
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) return;

  try {
    const text = (await response.clone().text()).slice(0, bodyMax);
    const json = safeJson(text);
    if (!json) return;
    const ctx: ApiCodeContext = {
      url,
      method,
      status: response.status,
      durationMs: duration,
      json,
      text,
    };
    if (filter(ctx)) {
      dispatchApiCode(hub, ctx);
    }
  } catch (err) {
    hub.logger.debug("http plugin: response inspect failed", err);
  }
}

// ---- XHR patch ----

interface XhrMeta {
  url: string;
  method: string;
  start: number;
}

function patchXhr(hub: Hub, ctx: PatchContext): void {
  if (typeof XMLHttpRequest === "undefined") return;
  const proto = XMLHttpRequest.prototype as unknown as PatchMarker &
    XMLHttpRequest;
  if (proto.__ghcHttpPatched) return;

  const originalOpen = proto.open;
  const originalSend = proto.send;

  // open 拦截：记录 url/method
  proto.open = function openPatched(
    this: XMLHttpRequest & { __ghcMeta?: XhrMeta },
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    this.__ghcMeta = {
      method: String(method ?? "GET").toUpperCase(),
      url: typeof url === "string" ? url : url.toString(),
      start: 0,
    };
    // 透传 rest（async / user / password）
    return (originalOpen as (this: XMLHttpRequest, ...args: unknown[]) => void).call(
      this,
      method,
      url,
      ...rest,
    );
  } as typeof proto.open;

  proto.send = function sendPatched(
    this: XMLHttpRequest & { __ghcMeta?: XhrMeta },
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const meta = this.__ghcMeta;
    if (!meta) return originalSend.call(this, body);

    if (isInternal(hub, meta.url) || isIgnored(meta.url, ctx.ignoreUrls)) {
      return originalSend.call(this, body);
    }

    meta.start = safeNow();
    const onLoad = (): void => {
      const duration = safeNow() - meta.start;
      const status = this.status;
      if (status === 0) return; // 网络层失败由 onerror/ontimeout 处理
      if (status < 200 || status >= 300) {
        dispatchAjax(hub, {
          url: meta.url,
          method: meta.method,
          status,
          statusText: this.statusText,
          durationMs: duration,
        });
        return;
      }
      // 成功 → 尝试业务 code 判定
      const responseType = this.responseType;
      if (responseType && responseType !== "text" && responseType !== "json")
        return;
      const contentType = this.getResponseHeader("content-type") ?? "";
      if (!contentType.toLowerCase().includes("json")) return;
      const text = (this.responseText ?? "").slice(0, ctx.bodyMax);
      const json = safeJson(text);
      if (!json) return;
      const apiCtx: ApiCodeContext = {
        url: meta.url,
        method: meta.method,
        status,
        durationMs: duration,
        json,
        text,
      };
      if (ctx.filter(apiCtx)) {
        dispatchApiCode(hub, apiCtx);
      }
    };
    const onNetworkFail = (statusText: string): void => {
      const duration = safeNow() - meta.start;
      dispatchAjax(hub, {
        url: meta.url,
        method: meta.method,
        status: 0,
        statusText,
        durationMs: duration,
      });
    };

    this.addEventListener("load", onLoad);
    this.addEventListener("error", () => onNetworkFail("network error"));
    this.addEventListener("timeout", () => onNetworkFail("timeout"));
    return originalSend.call(this, body);
  } as typeof proto.send;

  proto.__ghcHttpPatched = true;
}

// ---- 分发 ----

interface AjaxDispatch {
  readonly url: string;
  readonly method: string;
  readonly status: number;
  readonly statusText: string;
  readonly durationMs: number;
}

function dispatchAjax(hub: Hub, params: AjaxDispatch): void {
  const request: ErrorRequest = {
    url: params.url,
    method: params.method,
    status: params.status,
    statusText: params.statusText || undefined,
    durationMs: params.durationMs,
  };
  const event: GhcErrorEvent = {
    ...createBaseEvent(hub, "error"),
    type: "error",
    subType: "ajax",
    message: formatAjaxMessage(params),
    request,
    breadcrumbs: snapshotBreadcrumbs(hub),
  };
  hub.logger.debug("http dispatch ajax", params.method, params.url, params.status);
  void hub.transport.send(event);
}

function dispatchApiCode(hub: Hub, ctx: ApiCodeContext): void {
  const bizCode = extractBizCode(ctx.json);
  const bizMessage = extractBizMessage(ctx.json);
  const request: ErrorRequest = {
    url: ctx.url,
    method: ctx.method,
    status: ctx.status,
    durationMs: ctx.durationMs,
    bizCode,
    bizMessage,
  };
  const event: GhcErrorEvent = {
    ...createBaseEvent(hub, "error"),
    type: "error",
    subType: "api_code",
    message: `API code error: ${ctx.method} ${ctx.url} · code=${String(bizCode ?? "?")}`,
    request,
    breadcrumbs: snapshotBreadcrumbs(hub),
  };
  hub.logger.debug("http dispatch api_code", ctx.method, ctx.url, bizCode);
  void hub.transport.send(event);
}

// ---- 工具 ----

function formatAjaxMessage(p: AjaxDispatch): string {
  if (p.status === 0) return `Ajax failed: ${p.method} ${p.url} · ${p.statusText}`;
  return `Ajax ${p.status}: ${p.method} ${p.url}`;
}

function defaultApiCodeFilter(ctx: ApiCodeContext): boolean {
  const code = extractBizCode(ctx.json);
  if (code === undefined) return false;
  // 0 / "0" / "success" 视为成功
  if (code === 0) return false;
  if (typeof code === "string") {
    const normalized = code.toLowerCase();
    if (normalized === "0" || normalized === "success" || normalized === "ok")
      return false;
  }
  return true;
}

function extractBizCode(json: unknown): string | number | undefined {
  if (!json || typeof json !== "object") return undefined;
  const obj = json as Record<string, unknown>;
  const candidates = ["code", "errno", "errCode", "status"];
  for (const key of candidates) {
    const v = obj[key];
    if (typeof v === "number" || typeof v === "string") return v;
  }
  return undefined;
}

function extractBizMessage(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const obj = json as Record<string, unknown>;
  const candidates = ["message", "msg", "errMsg", "error"];
  for (const key of candidates) {
    const v = obj[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

// toUrl / isIgnored / isInternal / safeJson / safeNow / snapshotBreadcrumbs
// 已抽到 ./http-capture.ts，本文件保留 SDK 专属工具即可。
