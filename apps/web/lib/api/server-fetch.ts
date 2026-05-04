/**
 * 服务端组件专用 fetch 包装
 *
 * 与 http.ts 的客户端 fetch 不同，此函数在服务端组件（SSR）中调用，
 * 从 globalThis 读取 token（由 (console)/layout 注入）。
 */

/**
 * 构建请求头，自动注入 Authorization（如有 token）
 */
export function buildServerHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...extra,
  };
  // 服务端：从 globalThis 读取（由 (console)/layout.tsx 注入）
  const token = typeof window === "undefined" ? globalThis._serverAccessToken : null;
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * 服务端 fetch 包装：自动注入 token，统一错误处理
 */
export async function serverFetch<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: buildServerHeaders(),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

// globalThis 类型声明
declare global {
  // eslint-disable-next-line no-var
  var _serverAccessToken: string | undefined;
}
