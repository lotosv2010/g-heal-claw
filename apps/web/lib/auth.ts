/**
 * 认证令牌管理
 *
 * localStorage 存储 accessToken / refreshToken，
 * 额外设一个 cookie flag（ghc-auth=1）供 Next.js middleware 判断登录态。
 */

const ACCESS_TOKEN_KEY = "ghc-access-token";
const REFRESH_TOKEN_KEY = "ghc-refresh-token";
const AUTH_COOKIE_NAME = "ghc-auth";
const ACCESS_TOKEN_COOKIE = "ghc-at"; // accessToken cookie（短期，1h）

// ── localStorage + cookie 双写 ──

export function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    // 服务端：从 cookie 读取（通过全局注入的 _serverAccessToken）
    return globalThis._serverAccessToken ?? null;
  }
  // 客户端：优先 localStorage，降级 cookie
  return (
    localStorage.getItem(ACCESS_TOKEN_KEY) ??
    document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${ACCESS_TOKEN_COOKIE}=`))
      ?.split("=")[1] ??
    null
  );
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  // accessToken 写入 cookie（1h 过期），供服务端组件读取
  document.cookie = `${ACCESS_TOKEN_COOKIE}=${accessToken}; path=/; max-age=3600; samesite=lax`;
  // middleware 用的 flag cookie
  document.cookie = `${AUTH_COOKIE_NAME}=1; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  document.cookie = `${ACCESS_TOKEN_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0`;
}

// 服务端组件用：在 layout / middleware 中从 cookies() 读取后注入到 globalThis
declare global {
  // eslint-disable-next-line no-var
  var _serverAccessToken: string | undefined;
}

// ── API 调用 ──

import { getApiBaseUrl } from "./api/http";

interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly role: string;
  readonly isActive: boolean;
}

interface LoginResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: AuthUser;
}

export async function apiLogin(email: string, password: string): Promise<LoginResult> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "UNKNOWN", message: res.statusText }));
    throw new AuthApiError(res.status, body.error ?? "UNKNOWN", body.message ?? res.statusText);
  }
  const json = (await res.json()) as { data: LoginResult };
  setTokens(json.data.accessToken, json.data.refreshToken);
  return json.data;
}

export async function apiRegister(
  email: string,
  password: string,
  displayName?: string,
): Promise<LoginResult> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, displayName: displayName || undefined }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "UNKNOWN", message: res.statusText }));
    throw new AuthApiError(res.status, body.error ?? "UNKNOWN", body.message ?? res.statusText);
  }
  const json = (await res.json()) as { data: LoginResult };
  setTokens(json.data.accessToken, json.data.refreshToken);
  return json.data;
}

/** 刷新 access token；成功返回 true，失败清除登录态并返回 false */
export async function apiRefreshTokens(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const json = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
    setTokens(json.data.accessToken, json.data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

export async function apiLogout(): Promise<void> {
  const rt = getRefreshToken();
  const at = getAccessToken();
  const base = getApiBaseUrl();
  clearTokens();
  if (!rt || !at) return;
  // 尽力而为，失败不阻塞
  try {
    await fetch(`${base}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${at}`,
      },
      body: JSON.stringify({ refreshToken: rt }),
    });
  } catch {
    // ignore
  }
}

export class AuthApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}
