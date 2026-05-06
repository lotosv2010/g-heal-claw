/**
 * 通知渠道管理 API 客户端（T4.2.6）
 *
 * 端点前缀: /api/v1/projects/:projectId/channels
 * 鉴权: JWT Bearer
 */

import { dashboardFetch } from "./server-fetch";
import { httpPost, httpPatch, httpDelete } from "./http";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type ChannelType = "email" | "dingtalk" | "wecom" | "slack" | "webhook";

export interface ChannelConfig {
  /** email */
  readonly to?: string;
  /** dingtalk / wecom / slack / webhook */
  readonly webhookUrl?: string;
  /** dingtalk 签名密钥 */
  readonly secret?: string;
  /** webhook 自定义 URL */
  readonly url?: string;
  /** webhook HTTP 方法 */
  readonly method?: "POST" | "PUT";
}

export interface Channel {
  readonly id: string;
  readonly name: string;
  readonly type: ChannelType;
  readonly config: ChannelConfig;
  readonly enabled: boolean;
  readonly createdAt: string;
}

export interface CreateChannelInput {
  readonly name: string;
  readonly type: ChannelType;
  readonly config: ChannelConfig;
}

export interface UpdateChannelInput {
  readonly name?: string;
  readonly type?: ChannelType;
  readonly config?: ChannelConfig;
  readonly enabled?: boolean;
}

export type ChannelsSource = "live" | "empty" | "error";

export interface ChannelsResult {
  readonly source: ChannelsSource;
  readonly data: readonly Channel[];
}

// ---------------------------------------------------------------------------
// API 函数
// ---------------------------------------------------------------------------

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

/** 获取通知渠道列表（Server Component） */
export async function listChannels(projectId: string): Promise<ChannelsResult> {
  const url = `${baseUrl()}/api/v1/projects/${projectId}/channels`;
  try {
    const res = await dashboardFetch(url);
    if (!res.ok) {
      console.error(`[channels] ${res.status} ${res.statusText}`);
      return { source: "error", data: [] };
    }
    const json = (await res.json()) as { data?: Channel[] };
    const items = json.data ?? [];
    return { source: items.length > 0 ? "live" : "empty", data: items };
  } catch (err) {
    console.error("[channels] fetch failed:", (err as Error).message);
    return { source: "error", data: [] };
  }
}

/** 创建通知渠道（Client Component） */
export async function createChannel(
  projectId: string,
  input: CreateChannelInput,
): Promise<Channel> {
  const json = await httpPost<{ data: Channel }>(
    `/api/v1/projects/${projectId}/channels`,
    input,
  );
  return json.data;
}

/** 更新通知渠道（Client Component） */
export async function updateChannel(
  projectId: string,
  channelId: string,
  input: UpdateChannelInput,
): Promise<Channel> {
  const json = await httpPatch<{ data: Channel }>(
    `/api/v1/projects/${projectId}/channels/${channelId}`,
    input,
  );
  return json.data;
}

/** 删除通知渠道（Client Component） */
export async function deleteChannel(
  projectId: string,
  channelId: string,
): Promise<void> {
  await httpDelete(`/api/v1/projects/${projectId}/channels/${channelId}`);
}

/** 测试通知渠道（Client Component） */
export async function testChannel(
  projectId: string,
  channelId: string,
): Promise<void> {
  await httpPost(`/api/v1/projects/${projectId}/channels/${channelId}/test`);
}
