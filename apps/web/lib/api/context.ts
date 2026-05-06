/**
 * 请求上下文：统一获取当前 projectId 和 environment
 *
 * - Server Component：从 cookie 读取（layout.tsx 已通过 `cookies()` 获取）
 * - 客户端：从 cookie 读取
 * - 兜底：env 变量 → "demo"
 */

const PROJECT_COOKIE = "ghc-project";
const ENV_COOKIE = "ghc-env";

export function getActiveProjectId(): string {
  // 服务端：globalThis 注入（参考 _serverAccessToken 模式）
  if (typeof window === "undefined") {
    return globalThis._serverProjectId ?? process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "demo";
  }
  // 客户端
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${PROJECT_COOKIE}=`));
  return match?.split("=")[1] ?? process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "demo";
}

export function getActiveEnvironment(): string {
  if (typeof window === "undefined") {
    return globalThis._serverEnvironment ?? "production";
  }
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${ENV_COOKIE}=`));
  return match?.split("=")[1] ?? "production";
}

declare global {
  // eslint-disable-next-line no-var
  var _serverProjectId: string | undefined;
  // eslint-disable-next-line no-var
  var _serverEnvironment: string | undefined;
}
