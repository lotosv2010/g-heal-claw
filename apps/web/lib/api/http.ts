/**
 * 通用 fetch 包装
 *
 * 自动注入 Authorization Bearer，401 时尝试一次 refresh。
 */

import { getAccessToken, apiRefreshTokens, clearTokens } from "../auth";

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

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...extra,
  };
  const token = getAccessToken();
  if (token) {
    headers["authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      (body as { error?: string })?.error ?? "HTTP_ERROR",
      (body as { message?: string })?.message ?? res.statusText,
    );
  }
  return res.json() as Promise<T>;
}

/** 单次请求，不含自动 refresh */
async function rawFetch<T>(
  method: string,
  path: string,
  body?: unknown,
  options: HttpOptions = {},
): Promise<T> {
  const base = getApiBaseUrl();
  const url = base ? `${base}${path}` : path;
  const init: RequestInit = {
    method,
    headers: buildHeaders(body !== undefined ? { "content-type": "application/json" } : undefined),
    signal: options.signal,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  return handleResponse<T>(res);
}

// ── refresh 并发控制 ──
let refreshPromise: Promise<boolean> | null = null;

async function fetchWithRefresh<T>(
  method: string,
  path: string,
  body?: unknown,
  options: HttpOptions = {},
): Promise<T> {
  try {
    return await rawFetch<T>(method, path, body, options);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    // 尝试 refresh（合并并发请求）
    if (!refreshPromise) {
      refreshPromise = apiRefreshTokens().finally(() => {
        refreshPromise = null;
      });
    }
    const ok = await refreshPromise;
    if (!ok) {
      clearTokens();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw err;
    }
    // refresh 成功，重试原请求
    return rawFetch<T>(method, path, body, options);
  }
}

// ── 公开方法 ──

export async function httpGet<T>(path: string, options: HttpOptions = {}): Promise<T> {
  return fetchWithRefresh<T>("GET", path, undefined, options);
}

export async function httpPost<T>(path: string, body?: unknown, options: HttpOptions = {}): Promise<T> {
  return fetchWithRefresh<T>("POST", path, body, options);
}

export async function httpPatch<T>(path: string, body?: unknown, options: HttpOptions = {}): Promise<T> {
  return fetchWithRefresh<T>("PATCH", path, body, options);
}

export async function httpDelete<T>(path: string, options: HttpOptions = {}): Promise<T> {
  return fetchWithRefresh<T>("DELETE", path, undefined, options);
}
