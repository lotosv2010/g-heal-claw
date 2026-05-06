/**
 * 成员管理 API 客户端（对齐 ADR-0032 MembersController）
 *
 * 端点前缀: /api/v1/projects/:projectId/members
 * 鉴权: JWT Bearer
 */

import { buildServerHeaders } from "./server-fetch";
import { httpPost, httpPatch, httpDelete } from "./http";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type MemberRole = "owner" | "admin" | "member" | "viewer";

export interface Member {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly role: MemberRole;
  readonly joinedAt: string;
}

export interface InviteMemberInput {
  readonly email: string;
  readonly role: MemberRole;
}

export type MembersSource = "live" | "empty" | "error";

export interface MembersResult {
  readonly source: MembersSource;
  readonly data: readonly Member[];
}

// ---------------------------------------------------------------------------
// API 函数
// ---------------------------------------------------------------------------

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

export async function listMembers(projectId: string): Promise<MembersResult> {
  const url = `${baseUrl()}/api/v1/projects/${projectId}/members`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: buildServerHeaders(),
    });
    if (!res.ok) {
      console.error(`[members] ${res.status} ${res.statusText}`);
      return { source: "error", data: [] };
    }
    const json = (await res.json()) as { data?: Member[] };
    const items = json.data ?? [];
    return { source: items.length > 0 ? "live" : "empty", data: items };
  } catch (err) {
    console.error("[members] fetch failed:", (err as Error).message);
    return { source: "error", data: [] };
  }
}

export async function inviteMember(
  projectId: string,
  input: InviteMemberInput,
): Promise<Member> {
  const json = await httpPost<{ data: Member }>(`/api/v1/projects/${projectId}/members`, input);
  return json.data;
}

export async function updateMemberRole(
  projectId: string,
  userId: string,
  role: MemberRole,
): Promise<void> {
  await httpPatch(`/api/v1/projects/${projectId}/members/${userId}`, { role });
}

export async function removeMember(
  projectId: string,
  userId: string,
): Promise<void> {
  await httpDelete(`/api/v1/projects/${projectId}/members/${userId}`);
}
