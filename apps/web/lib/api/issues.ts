import { getActiveProjectId, getActiveEnvironment } from "./context";
import { dashboardFetch } from "./server-fetch";

export interface IssueListItem {
  readonly id: string;
  readonly fingerprint: string;
  readonly subType: string;
  readonly title: string;
  readonly level: string;
  readonly status: string;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly eventCount: number;
  readonly impactedSessions: number;
  readonly assignedUserId: string | null;
}

export interface IssueDetail extends IssueListItem {
  readonly recentEvents: readonly IssueEvent[];
}

export interface IssueEvent {
  readonly eventId: string;
  readonly timestamp: string;
  readonly message: string;
  readonly stack: string | null;
  readonly url: string | null;
  readonly browser: string | null;
  readonly os: string | null;
  readonly deviceType: string | null;
  readonly environment: string | null;
  readonly sessionId: string;
}

export interface IssuesListResult {
  readonly data: IssueListItem[];
  readonly pagination: { page: number; limit: number; total: number };
}

export interface IssuesListParams {
  readonly status?: string;
  readonly subType?: string;
  readonly sort?: string;
  readonly order?: string;
  readonly page?: number;
  readonly limit?: number;
}

export async function listIssues(
  params: IssuesListParams = {},
): Promise<IssuesListResult> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const projectId = await getActiveProjectId();
  const qs = new URLSearchParams({ projectId });

  if (params.status) qs.set("status", params.status);
  if (params.subType) qs.set("subType", params.subType);
  if (params.sort) qs.set("sort", params.sort);
  if (params.order) qs.set("order", params.order);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));

  const url = `${baseUrl}/dashboard/v1/issues?${qs.toString()}`;

  try {
    const response = await dashboardFetch(url);
    if (!response.ok) {
      return { data: [], pagination: { page: 1, limit: 20, total: 0 } };
    }
    const json = (await response.json()) as IssuesListResult;
    return json;
  } catch {
    return { data: [], pagination: { page: 1, limit: 20, total: 0 } };
  }
}

export async function getIssueDetail(
  issueId: string,
): Promise<IssueDetail | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const projectId = await getActiveProjectId();
  const url = `${baseUrl}/dashboard/v1/issues/${issueId}?projectId=${projectId}`;

  try {
    const response = await dashboardFetch(url);
    if (!response.ok) return null;
    const json = (await response.json()) as { data: IssueDetail };
    return json.data;
  } catch {
    return null;
  }
}
