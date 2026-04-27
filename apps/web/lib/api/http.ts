/**
 * 通用 fetch 包装
 *
 * 本期所有 Dashboard API 尚未落地，各 `lib/api/*.ts` 模块内直接返回 mock fixture。
 * 此处保留统一入口，后端落地后（T1.6.x / T2.1.6）替换实现为真实 fetch，
 * 调用方无需改动。
 */

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface HttpOptions {
  readonly signal?: AbortSignal;
}

/** 后端基地址：空字符串时说明尚未接入真实 API，由各模块使用 mock */
export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
}

/**
 * GET 请求的最小封装。本期不使用（所有查询走 mock），保留类型契约供后端 API 落地后启用。
 */
export async function httpGet<T>(
  path: string,
  options: HttpOptions = {},
): Promise<T> {
  const base = getApiBaseUrl();
  const url = base ? `${base}${path}` : path;
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: options.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, "HTTP_ERROR", text || res.statusText);
  }
  return res.json() as Promise<T>;
}
