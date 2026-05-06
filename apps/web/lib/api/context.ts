/**
 * 请求上下文：统一获取当前 projectId 和 environment
 *
 * Server Component：动态 import next/headers 读 cookie（避免 Client Component 报错）
 * Client Component：从 document.cookie 读取
 */

const PROJECT_COOKIE = "ghc-project";
const ENV_COOKIE = "ghc-env";
const DEFAULT_PROJECT = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "demo";

async function readServerCookie(name: string): Promise<string | undefined> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store.get(name)?.value;
  } catch {
    return undefined;
  }
}

export async function getActiveProjectId(): Promise<string> {
  if (typeof window === "undefined") {
    const val = await readServerCookie(PROJECT_COOKIE);
    return val ?? DEFAULT_PROJECT;
  }
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${PROJECT_COOKIE}=`));
  return match?.split("=")[1] ?? DEFAULT_PROJECT;
}

export async function getActiveEnvironment(): Promise<string> {
  if (typeof window === "undefined") {
    const val = await readServerCookie(ENV_COOKIE);
    return val ?? "production";
  }
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${ENV_COOKIE}=`));
  return match?.split("=")[1] ?? "production";
}
