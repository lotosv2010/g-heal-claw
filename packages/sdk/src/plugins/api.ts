/**
 * API 采集插件（ADR-0020 §4.1）
 *
 * 职责：采集所有 fetch / XHR 请求的明细（含成功），映射到 `ApiEventSchema`
 * （`type: 'api'`），独立于 `httpPlugin`（type='error'）的异常链路。
 *
 * 与 `httpPlugin` 的分工：
 *  - `httpPlugin` 关注：非 2xx / 网络失败 / api_code 业务异常 → 异常模块
 *  - `apiPlugin` 关注：所有请求的吞吐 / 耗时 / 状态码分布 → API 监控模块
 *
 * 两者可同时启用；各自维护独立的 patch 标记（`__ghcHttpPatched` / `__ghcApiPatched`）
 * 以确保函数可串联调用而不互相吞掉。
 *
 * 设计约束：
 *  - SSR 降级：非浏览器环境 / window.fetch 不存在 → 跳过
 *  - 零阻塞：所有网络事件均通过 `hub.transport.send` 异步吞错
 *  - 幂等 patch：重复 setup 不会重复 wrap
 */
import type { ApiEvent } from "@g-heal-claw/shared";
import { createBaseEvent } from "../event.js";
import type { Hub } from "../hub.js";
import type { Plugin } from "../plugin.js";
import {
  estimateBodySize,
  generateTraceId,
  isIgnored,
  isInternal,
  safeNow,
  safeReadResponseText,
  snapshotBreadcrumbs,
  toUrl,
  truncateBody,
} from "./http-capture.js";

/** 默认慢请求阈值：1000ms（ADR-0020 §4.1） */
const DEFAULT_SLOW_THRESHOLD_MS = 1000;

export interface ApiPluginOptions {
  /** 是否启用采集，默认 true */
  readonly enabled?: boolean;
  /** 慢请求阈值（毫秒），默认 1000 */
  readonly slowThresholdMs?: number;
  /** URL 黑名单（字符串子串或正则） */
  readonly ignoreUrls?: ReadonlyArray<string | RegExp>;
  /** 是否采集请求/响应体（截断 ≤4KB），默认 false */
  readonly captureBody?: boolean;
  /** TraceID 注入 header 名（设置后自动注入，如 'X-Trace-Id'），默认不注入 */
  readonly traceIdHeaderName?: string;
}

interface PatchMarker {
  __ghcApiPatched?: boolean;
}

interface ResolvedOptions {
  readonly slowThresholdMs: number;
  readonly ignoreUrls: ReadonlyArray<string | RegExp>;
  readonly captureBody: boolean;
  readonly traceIdHeaderName: string | undefined;
}

/**
 * ApiPlugin 工厂
 */
export function apiPlugin(opts: ApiPluginOptions = {}): Plugin {
  const enabled = opts.enabled ?? true;
  const resolved: ResolvedOptions = {
    slowThresholdMs: opts.slowThresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS,
    ignoreUrls: opts.ignoreUrls ?? [],
    captureBody: opts.captureBody ?? false,
    traceIdHeaderName: opts.traceIdHeaderName,
  };

  return {
    name: "api",
    setup(hub) {
      if (!enabled) {
        hub.logger.debug("api plugin: 禁用");
        return;
      }
      if (typeof window === "undefined") {
        hub.logger.debug("api plugin: 非浏览器环境，跳过");
        return;
      }
      patchFetch(hub, resolved);
      patchXhr(hub, resolved);
    },
  };
}

// ---- fetch patch ----

function patchFetch(hub: Hub, opts: ResolvedOptions): void {
  const original = (window as { fetch?: typeof fetch }).fetch;
  if (!original) return;
  const marker = original as PatchMarker & typeof fetch;
  if (marker.__ghcApiPatched) return;

  const wrapped = async function patched(
    this: unknown,
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = toUrl(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const start = safeNow();

    if (isInternal(hub, url) || isIgnored(url, opts.ignoreUrls)) {
      return original.call(this, input, init);
    }

    // T2.2.3：TraceID 注入
    let traceId: string | undefined;
    let patchedInit = init;
    if (opts.traceIdHeaderName) {
      traceId = generateTraceId();
      const headers = new Headers(init?.headers);
      headers.set(opts.traceIdHeaderName, traceId);
      patchedInit = { ...init, headers };
    }

    const requestSize = estimateBodySize(patchedInit?.body);
    // T2.2.2：请求体截断
    const requestBody = opts.captureBody ? truncateBody(patchedInit?.body) : undefined;

    try {
      const response = await original.call(this, input, patchedInit);
      const duration = safeNow() - start;
      // T2.2.2：响应体截断（异步读取不阻塞返回）
      const responseBody = opts.captureBody ? await safeReadResponseText(response) : undefined;
      dispatch(hub, {
        method,
        url,
        status: response.status,
        durationMs: duration,
        slow: duration >= opts.slowThresholdMs,
        failed: !response.ok,
        requestSize,
        responseSize: parseContentLength(response.headers.get("content-length")),
        traceId,
        requestBody,
        responseBody,
      });
      return response;
    } catch (err) {
      const duration = safeNow() - start;
      dispatch(hub, {
        method,
        url,
        status: 0,
        durationMs: duration,
        slow: duration >= opts.slowThresholdMs,
        failed: true,
        errorMessage: (err as Error)?.message ?? "fetch error",
        requestSize,
        traceId,
        requestBody,
      });
      throw err;
    }
  };
  (wrapped as PatchMarker).__ghcApiPatched = true;
  (window as { fetch?: typeof fetch }).fetch = wrapped as typeof fetch;
}

// ---- XHR patch ----

interface XhrMeta {
  url: string;
  method: string;
  start: number;
  requestSize?: number;
}

function patchXhr(hub: Hub, opts: ResolvedOptions): void {
  if (typeof XMLHttpRequest === "undefined") return;
  const proto = XMLHttpRequest.prototype as unknown as PatchMarker &
    XMLHttpRequest;
  if (proto.__ghcApiPatched) return;

  const originalOpen = proto.open;
  const originalSend = proto.send;

  proto.open = function openPatched(
    this: XMLHttpRequest & { __ghcApiMeta?: XhrMeta },
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    this.__ghcApiMeta = {
      method: String(method ?? "GET").toUpperCase(),
      url: typeof url === "string" ? url : url.toString(),
      start: 0,
    };
    return (originalOpen as (this: XMLHttpRequest, ...args: unknown[]) => void).call(
      this,
      method,
      url,
      ...rest,
    );
  } as typeof proto.open;

  proto.send = function sendPatched(
    this: XMLHttpRequest & { __ghcApiMeta?: XhrMeta },
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const meta = this.__ghcApiMeta;
    if (!meta) return originalSend.call(this, body);

    if (isInternal(hub, meta.url) || isIgnored(meta.url, opts.ignoreUrls)) {
      return originalSend.call(this, body);
    }

    // T2.2.3：TraceID 注入
    let traceId: string | undefined;
    if (opts.traceIdHeaderName) {
      traceId = generateTraceId();
      try {
        this.setRequestHeader(opts.traceIdHeaderName, traceId);
      } catch { /* ignore if headers already sent */ }
    }

    meta.start = safeNow();
    meta.requestSize = estimateBodySize(body);
    const requestBody = opts.captureBody ? truncateBody(body) : undefined;

    const onDone = (failed: boolean, errorMessage?: string): void => {
      const duration = safeNow() - meta.start;
      const status = this.status;
      // T2.2.2：XHR 响应体截断
      const responseBody = opts.captureBody ? truncateBody(this.responseText) : undefined;
      dispatch(hub, {
        method: meta.method,
        url: meta.url,
        status,
        durationMs: duration,
        slow: duration >= opts.slowThresholdMs,
        failed: failed || status === 0 || status >= 400,
        errorMessage,
        requestSize: meta.requestSize,
        responseSize: parseContentLength(
          safeGetResponseHeader(this, "content-length"),
        ),
        traceId,
        requestBody,
        responseBody,
      });
    };

    this.addEventListener("load", () => onDone(false));
    this.addEventListener("error", () => onDone(true, "network error"));
    this.addEventListener("timeout", () => onDone(true, "timeout"));
    this.addEventListener("abort", () => onDone(true, "abort"));
    return originalSend.call(this, body);
  } as typeof proto.send;

  proto.__ghcApiPatched = true;
}

// ---- 分发 ----

interface DispatchParams {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly durationMs: number;
  readonly slow: boolean;
  readonly failed: boolean;
  readonly errorMessage?: string;
  readonly requestSize?: number;
  readonly responseSize?: number;
  readonly traceId?: string;
  readonly requestBody?: string;
  readonly responseBody?: string;
}

function dispatch(hub: Hub, p: DispatchParams): void {
  const event: ApiEvent = {
    ...createBaseEvent(hub, "api"),
    type: "api",
    method: p.method,
    url: p.url,
    status: p.status,
    duration: p.durationMs,
    slow: p.slow,
    failed: p.failed,
    requestSize: p.requestSize,
    responseSize: p.responseSize,
    errorMessage: p.errorMessage,
    traceId: p.traceId,
    requestBody: p.requestBody,
    responseBody: p.responseBody,
    breadcrumbs: snapshotBreadcrumbs(hub),
  };
  hub.logger.debug("api dispatch", p.method, p.url, p.status, p.durationMs);
  void hub.transport.send(event);
}

// ---- 工具 ----

function parseContentLength(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function safeGetResponseHeader(
  xhr: XMLHttpRequest,
  name: string,
): string | null {
  try {
    return xhr.getResponseHeader(name);
  } catch {
    return null;
  }
}
