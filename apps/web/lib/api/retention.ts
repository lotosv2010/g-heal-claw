/**
 * 用户留存大盘数据契约（ADR-0028 / tracking/retention）
 *
 * Web 层消费 server `/dashboard/v1/tracking/retention`：
 *  - 参数校验失败 / 5xx → source: "error"
 *  - 空窗口（totalNewUsers=0）→ source: "empty"
 *  - 有样本 → source: "live"
 *
 * Server Component 侧独立类型，避免直接依赖 server DTO；
 * 契约稳定后可抽入 packages/shared。
 */

import type { OverviewSource } from "./performance";

export type RetentionIdentity = "session" | "user";

export interface RetentionCohort {
  readonly cohortDate: string;
  readonly cohortSize: number;
  /** 长度 = returnDays + 1，day 0 恒为 1（除非空 cohort） · 4 位小数 */
  readonly retentionByDay: readonly number[];
}

export interface RetentionOverview {
  readonly identity: RetentionIdentity;
  readonly cohortDays: number;
  readonly returnDays: number;
  readonly window: { readonly sinceMs: number; readonly untilMs: number };
  readonly totalNewUsers: number;
  /** 跨 cohort 的按 cohortSize 加权平均，长度 = returnDays + 1 */
  readonly averageByDay: readonly number[];
  readonly cohorts: readonly RetentionCohort[];
}

export interface RetentionOverviewResult {
  readonly source: OverviewSource;
  readonly data: RetentionOverview;
}

/** URL Query（Server Component 侧） */
export interface RetentionQuery {
  readonly cohortDays: number;
  readonly returnDays: number;
  readonly identity: RetentionIdentity;
  readonly since?: string;
  readonly until?: string;
}

// ------- 常量 -------

export const RETENTION_DAYS_MIN = 1;
export const RETENTION_DAYS_MAX = 30;
export const RETENTION_DEFAULT_COHORT_DAYS = 7;
export const RETENTION_DEFAULT_RETURN_DAYS = 7;
export const RETENTION_DEFAULT_IDENTITY: RetentionIdentity = "session";

// ------- Query 解析 -------

/**
 * 从 searchParams 解析并夹紧到合法区间；
 * 非法输入静默回退到默认值，避免 Server Component 抛错导致整页失败。
 */
export function parseRetentionQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): RetentionQuery {
  const raw = searchParams ?? {};

  const cohortDays = clampInt(
    raw.cohortDays,
    RETENTION_DAYS_MIN,
    RETENTION_DAYS_MAX,
    RETENTION_DEFAULT_COHORT_DAYS,
  );
  const returnDays = clampInt(
    raw.returnDays,
    RETENTION_DAYS_MIN,
    RETENTION_DAYS_MAX,
    RETENTION_DEFAULT_RETURN_DAYS,
  );

  const identityRaw = typeof raw.identity === "string" ? raw.identity : "";
  const identity: RetentionIdentity =
    identityRaw === "user" || identityRaw === "session"
      ? identityRaw
      : RETENTION_DEFAULT_IDENTITY;

  const since = typeof raw.since === "string" && raw.since ? raw.since : undefined;
  const until = typeof raw.until === "string" && raw.until ? raw.until : undefined;

  return { cohortDays, returnDays, identity, since, until };
}

function clampInt(
  raw: string | string[] | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof raw !== "string") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ------- 数据获取 -------

export async function getRetentionOverview(
  query: RetentionQuery,
): Promise<RetentionOverviewResult> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const projectId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "demo";
  const params = new URLSearchParams({
    projectId,
    cohortDays: String(query.cohortDays),
    returnDays: String(query.returnDays),
    identity: query.identity,
  });
  if (query.since) params.set("since", query.since);
  if (query.until) params.set("until", query.until);
  const url = `${baseUrl}/dashboard/v1/tracking/retention?${params.toString()}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      console.error(
        `[retention-overview] ${response.status} ${response.statusText} @ ${url}`,
      );
      return { source: "error", data: emptyRetentionOverview(query) };
    }
    const json = (await response.json()) as {
      data?: Partial<RetentionOverview> & {
        source?: OverviewSource;
      };
    };
    const rawData = json.data;
    if (!rawData) {
      return { source: "empty", data: emptyRetentionOverview(query) };
    }
    // server DTO 自带 source，透传即可；兼容老接口按样本量推断
    const data = normalizeOverview(rawData, query);
    const source: OverviewSource =
      rawData.source ?? (data.totalNewUsers > 0 ? "live" : "empty");
    return { source, data };
  } catch (err) {
    console.error(
      `[retention-overview] fetch failed @ ${url} —`,
      (err as Error).message,
    );
    return { source: "error", data: emptyRetentionOverview(query) };
  }
}

function normalizeOverview(
  raw: Partial<RetentionOverview>,
  query: RetentionQuery,
): RetentionOverview {
  const empty = emptyRetentionOverview(query);
  return {
    identity: raw.identity ?? empty.identity,
    cohortDays: raw.cohortDays ?? empty.cohortDays,
    returnDays: raw.returnDays ?? empty.returnDays,
    window: raw.window ?? empty.window,
    totalNewUsers: raw.totalNewUsers ?? empty.totalNewUsers,
    averageByDay: raw.averageByDay ?? empty.averageByDay,
    cohorts: raw.cohorts ?? empty.cohorts,
  };
}

export function emptyRetentionOverview(query: RetentionQuery): RetentionOverview {
  const now = Date.now();
  const untilMs = query.until ? Date.parse(query.until) : now;
  const sinceMs = query.since
    ? Date.parse(query.since)
    : untilMs - (query.cohortDays + query.returnDays) * 24 * 60 * 60 * 1000;
  return {
    identity: query.identity,
    cohortDays: query.cohortDays,
    returnDays: query.returnDays,
    window: { sinceMs, untilMs },
    totalNewUsers: 0,
    averageByDay: new Array(query.returnDays + 1).fill(0),
    cohorts: [],
  };
}
