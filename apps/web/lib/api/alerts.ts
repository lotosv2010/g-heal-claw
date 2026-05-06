/**
 * 告警规则管理 API 客户端（T4.2.5）
 *
 * 端点前缀: /api/v1/projects/:projectId/alert-rules
 * 鉴权: JWT Bearer
 */

import { dashboardFetch } from "./server-fetch";
import { httpPost, httpPatch, httpDelete } from "./http";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface AlertRule {
  readonly id: string;
  readonly name: string;
  readonly target: string;
  readonly operator: string;
  readonly threshold: number;
  readonly windowMs: number;
  readonly severity: string;
  readonly cooldownMs: number;
  readonly enabled: boolean;
  readonly lastFiredAt: string | null;
  readonly createdAt: string;
}

export interface AlertHistory {
  readonly id: string;
  readonly ruleId: string;
  readonly ruleName: string;
  readonly severity: string;
  readonly value: number;
  readonly threshold: number;
  readonly firedAt: string;
}

export interface CreateAlertRuleInput {
  readonly name: string;
  readonly target: string;
  readonly operator: string;
  readonly threshold: number;
  readonly windowMs: number;
  readonly severity: string;
  readonly cooldownMs: number;
}

export interface UpdateAlertRuleInput {
  readonly name?: string;
  readonly target?: string;
  readonly operator?: string;
  readonly threshold?: number;
  readonly windowMs?: number;
  readonly severity?: string;
  readonly cooldownMs?: number;
}

export type AlertRulesSource = "live" | "empty" | "error";

export interface AlertRulesResult {
  readonly source: AlertRulesSource;
  readonly data: readonly AlertRule[];
}

export interface AlertHistoryResult {
  readonly source: AlertRulesSource;
  readonly data: readonly AlertHistory[];
}

// ---------------------------------------------------------------------------
// API 函数
// ---------------------------------------------------------------------------

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

/** 获取告警规则列表（Server Component） */
export async function listAlertRules(projectId: string): Promise<AlertRulesResult> {
  const url = `${baseUrl()}/api/v1/projects/${projectId}/alert-rules`;
  try {
    const res = await dashboardFetch(url);
    if (!res.ok) {
      console.error(`[alerts] ${res.status} ${res.statusText}`);
      return { source: "error", data: [] };
    }
    const json = (await res.json()) as { data?: AlertRule[] };
    const items = json.data ?? [];
    return { source: items.length > 0 ? "live" : "empty", data: items };
  } catch (err) {
    console.error("[alerts] fetch failed:", (err as Error).message);
    return { source: "error", data: [] };
  }
}

/** 创建告警规则（Client Component） */
export async function createAlertRule(
  projectId: string,
  input: CreateAlertRuleInput,
): Promise<AlertRule> {
  const json = await httpPost<{ data: AlertRule }>(
    `/api/v1/projects/${projectId}/alert-rules`,
    input,
  );
  return json.data;
}

/** 更新告警规则（Client Component） */
export async function updateAlertRule(
  projectId: string,
  ruleId: string,
  input: UpdateAlertRuleInput,
): Promise<AlertRule> {
  const json = await httpPatch<{ data: AlertRule }>(
    `/api/v1/projects/${projectId}/alert-rules/${ruleId}`,
    input,
  );
  return json.data;
}

/** 切换告警规则启用状态（Client Component） */
export async function toggleAlertRule(
  projectId: string,
  ruleId: string,
  enabled: boolean,
): Promise<AlertRule> {
  const json = await httpPatch<{ data: AlertRule }>(
    `/api/v1/projects/${projectId}/alert-rules/${ruleId}/toggle`,
    { enabled },
  );
  return json.data;
}

/** 删除告警规则（Client Component） */
export async function deleteAlertRule(
  projectId: string,
  ruleId: string,
): Promise<void> {
  await httpDelete(`/api/v1/projects/${projectId}/alert-rules/${ruleId}`);
}

/** 获取告警触发历史（Server Component） */
export async function listAlertHistory(
  projectId: string,
  params?: { page?: number; limit?: number },
): Promise<AlertHistoryResult> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const qs = searchParams.toString();
  const url = `${baseUrl()}/api/v1/projects/${projectId}/alert-rules/history${qs ? `?${qs}` : ""}`;
  try {
    const res = await dashboardFetch(url);
    if (!res.ok) {
      console.error(`[alerts-history] ${res.status} ${res.statusText}`);
      return { source: "error", data: [] };
    }
    const json = (await res.json()) as { data?: AlertHistory[] };
    const items = json.data ?? [];
    return { source: items.length > 0 ? "live" : "empty", data: items };
  } catch (err) {
    console.error("[alerts-history] fetch failed:", (err as Error).message);
    return { source: "error", data: [] };
  }
}
