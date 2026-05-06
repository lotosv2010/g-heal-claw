/**
 * API Token 管理客户端（对齐 ADR-0032 TokensController）
 *
 * 端点前缀: /api/v1/projects/:projectId/tokens
 * 鉴权: JWT Bearer
 */

import { buildServerHeaders } from "./server-fetch";
import { httpPost, httpDelete } from "./http";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface Token {
  readonly id: string;
  readonly label: string | null;
  /** 脱敏后的 secretKey（仅首尾可见） */
  readonly secretKeyMasked: string;
  readonly isActive: boolean;
  readonly createdAt: string;
}

/** 创建后一次性返回完整 secretKey */
export interface TokenCreated {
  readonly id: string;
  readonly label: string | null;
  readonly secretKey: string;
  readonly createdAt: string;
}

export interface CreateTokenInput {
  readonly label?: string;
}

export type TokensSource = "live" | "empty" | "error";

export interface TokensResult {
  readonly source: TokensSource;
  readonly data: readonly Token[];
}

// ---------------------------------------------------------------------------
// API 函数
// ---------------------------------------------------------------------------

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

export async function listTokens(projectId: string): Promise<TokensResult> {
  const url = `${baseUrl()}/api/v1/projects/${projectId}/tokens`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: buildServerHeaders(),
    });
    if (!res.ok) {
      console.error(`[tokens] ${res.status} ${res.statusText}`);
      return { source: "error", data: [] };
    }
    const json = (await res.json()) as { data?: Token[] };
    const items = json.data ?? [];
    return { source: items.length > 0 ? "live" : "empty", data: items };
  } catch (err) {
    console.error("[tokens] fetch failed:", (err as Error).message);
    return { source: "error", data: [] };
  }
}

export async function createToken(
  projectId: string,
  input: CreateTokenInput = {},
): Promise<TokenCreated> {
  const json = await httpPost<{ data: TokenCreated }>(`/api/v1/projects/${projectId}/tokens`, input);
  return json.data;
}

export async function deleteToken(
  projectId: string,
  tokenId: string,
): Promise<void> {
  await httpDelete(`/api/v1/projects/${projectId}/tokens/${tokenId}`);
}
