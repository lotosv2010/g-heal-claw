/**
 * HTTP 捕获共享纯函数（ADR-0020 §4.1）
 *
 * 设计目的：`httpPlugin`（type='error'）与 `apiPlugin`（type='api'）共用同一套
 * URL 判定 / 时间戳 / JSON 解析 / Breadcrumb 快照工具，避免双份实现漂移。
 *
 * 约束：
 *  - 纯函数，无副作用
 *  - 浏览器兼容，零 Node.js API
 *  - 所有函数对"非浏览器 / 畸形输入"均有降级返回值
 */
import type { Breadcrumb } from "@g-heal-claw/shared";
import type { Hub } from "../hub.js";

export function toUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function isIgnored(
  url: string,
  patterns: ReadonlyArray<string | RegExp>,
): boolean {
  for (const p of patterns) {
    if (typeof p === "string") {
      if (url.includes(p)) return true;
    } else if (p.test(url)) {
      return true;
    }
  }
  return false;
}

export function isInternal(hub: Hub, url: string): boolean {
  const ingest = hub.dsn.ingestUrl;
  if (!ingest) return false;
  return url.startsWith(ingest);
}

export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function safeNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function")
    return performance.now();
  return Date.now();
}

/**
 * 拷贝 Hub 环形缓冲中的 Breadcrumb 快照，最多保留最近 50 条。
 */
export function snapshotBreadcrumbs(hub: Hub): Breadcrumb[] | undefined {
  const arr = hub.scope.breadcrumbs;
  return arr.length > 0 ? [...arr].slice(-50) : undefined;
}

/**
 * 从 URL 中提取 host（失败则返回原串）
 */
export function extractHost(url: string): string {
  try {
    const u = new URL(url, typeof location !== "undefined" ? location.href : "http://localhost");
    return u.host;
  } catch {
    return url;
  }
}

/**
 * 从 URL 中提取 pathname（失败则返回原串）
 */
export function extractPath(url: string): string {
  try {
    const u = new URL(url, typeof location !== "undefined" ? location.href : "http://localhost");
    return u.pathname;
  } catch {
    return url;
  }
}

/**
 * 计算请求体近似字节数
 *
 *  - string → UTF-8 byte length（简易估算，emoji 按 4 字节）
 *  - ArrayBuffer / Blob → byteLength / size
 *  - FormData / URLSearchParams → 不测（返回 undefined）
 *  - null / undefined → undefined
 */
export function estimateBodySize(body: unknown): number | undefined {
  if (body === null || body === undefined) return undefined;
  if (typeof body === "string") {
    try {
      return new TextEncoder().encode(body).byteLength;
    } catch {
      return body.length;
    }
  }
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (typeof Blob !== "undefined" && body instanceof Blob) return body.size;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  return undefined;
}

/** 最大截断字节数（4KB） */
const MAX_BODY_BYTES = 4096;

/** 将请求/响应体安全截断为字符串（≤4KB），非字符串类型返回 undefined */
export function truncateBody(body: unknown): string | undefined {
  if (body === null || body === undefined) return undefined;
  let text: string;
  if (typeof body === "string") {
    text = body;
  } else if (typeof body === "object") {
    try {
      text = JSON.stringify(body);
    } catch {
      return undefined;
    }
  } else {
    return undefined;
  }
  if (text.length <= MAX_BODY_BYTES) return text;
  return text.slice(0, MAX_BODY_BYTES) + "…[truncated]";
}

/** 安全读取 Response body text（clone 后读取，避免消费原 body） */
export async function safeReadResponseText(response: Response): Promise<string | undefined> {
  try {
    const clone = response.clone();
    const text = await clone.text();
    return truncateBody(text);
  } catch {
    return undefined;
  }
}

/** 生成 TraceID（16 字节 hex = 32 字符） */
export function generateTraceId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  let id = "";
  for (let i = 0; i < 32; i++) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  return id;
}
