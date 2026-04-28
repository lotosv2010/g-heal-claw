/**
 * 服务端 DSN 解析（T1.3.2）
 *
 * 与 `packages/sdk/src/dsn.ts` 协议同步，但不依赖 SDK —— 架构红线：apps/server
 * 不得 import sdk。函数极小，重复成本远低于跨包依赖成本。
 *
 * 格式：`<protocol>://<publicKey>@<host>[:<port>]/<projectId>`
 */
export interface ParsedDsn {
  readonly protocol: "http" | "https";
  readonly publicKey: string;
  readonly host: string;
  readonly port?: string;
  readonly projectId: string;
}

/**
 * 解析 DSN 字符串；失败返回 `null`（调用方转 401）
 */
export function parseDsn(dsn: string | undefined | null): ParsedDsn | null {
  if (typeof dsn !== "string" || dsn.length === 0) return null;
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  const protocol = url.protocol.replace(":", "");
  if (protocol !== "http" && protocol !== "https") return null;
  const publicKey = url.username;
  if (!publicKey) return null;
  const projectId = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!projectId || projectId.includes("/")) return null;
  const host = url.hostname;
  if (!host) return null;
  return {
    protocol: protocol as "http" | "https",
    publicKey,
    host,
    port: url.port || undefined,
    projectId,
  };
}
