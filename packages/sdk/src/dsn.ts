/**
 * DSN 结构
 *
 * 格式：`<protocol>://<publicKey>@<host>/<projectId>`
 * 例：`http://pk_xxx@localhost:3001/proj_demo`
 */
export interface ParsedDsn {
  readonly protocol: "http" | "https";
  readonly publicKey: string;
  readonly host: string;
  readonly port?: string;
  readonly projectId: string;
  /** 上报端点完整 URL：`${protocol}://${host}[:${port}]/ingest/v1/events` */
  readonly ingestUrl: string;
}

/**
 * 解析 DSN 字符串
 *
 * 失败时返回 `null`（而非抛错）——SDK 初始化失败必须 no-op，不影响宿主页面。
 */
export function parseDsn(dsn: string): ParsedDsn | null {
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
  // pathname 以 `/` 开头，去掉；不允许嵌套路径
  const projectId = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!projectId || projectId.includes("/")) return null;
  const host = url.hostname;
  if (!host) return null;
  const port = url.port || undefined;
  const portPart = port ? `:${port}` : "";
  const ingestUrl = `${protocol}://${host}${portPart}/ingest/v1/events`;
  return {
    protocol: protocol as "http" | "https",
    publicKey,
    host,
    port,
    projectId,
    ingestUrl,
  };
}
