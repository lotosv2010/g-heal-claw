/**
 * API 大盘数据契约（对齐 ADR-0020 §4.2 / TM.1.A.4）
 *
 * Web 层消费 server `/dashboard/v1/api/overview`：
 *  - 失败 / 5xx → source: "error"
 *  - 空窗口 → source: "empty"
 *  - 有样本 → source: "live"
 */

import type { OverviewSource } from "./performance";
import { getActiveProjectId, getActiveEnvironment } from "./context";
import { dashboardFetch } from "./server-fetch";

export type DeltaDirection = "up" | "down" | "flat";
export type StatusBucket = "2xx" | "3xx" | "4xx" | "5xx" | "0" | "other";

export interface ApiSummary {
  readonly totalRequests: number;
  readonly slowCount: number;
  readonly failedCount: number;
  readonly p75DurationMs: number;
  readonly slowRatio: number;
  readonly failedRatio: number;
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
}

export interface ApiStatusBucketRatio {
  readonly bucket: StatusBucket;
  readonly count: number;
  readonly ratio: number;
}

export interface ApiTrendBucket {
  readonly hour: string;
  readonly count: number;
  readonly slowCount: number;
  readonly failedCount: number;
  readonly avgDurationMs: number;
  readonly successRatio: number;
}

export interface ApiTopSlowRow {
  readonly method: string;
  readonly host: string;
  readonly pathTemplate: string;
  readonly sampleCount: number;
  readonly p75DurationMs: number;
  readonly failureRatio: number;
}

export interface ApiTopRequestRow {
  readonly method: string;
  readonly host: string;
  readonly pathTemplate: string;
  readonly sampleCount: number;
  readonly avgDurationMs: number;
  readonly failureRatio: number;
}

export interface ApiTopPageRow {
  readonly pagePath: string;
  readonly requestCount: number;
  readonly avgDurationMs: number;
  readonly failedCount: number;
  readonly failureRatio: number;
}

export interface ApiTopErrorStatusRow {
  readonly status: number;
  readonly count: number;
  readonly ratio: number;
}

export interface ApiDimensionRow {
  readonly value: string;
  readonly sampleCount: number;
  /** 占比百分比（0~100） */
  readonly sharePercent: number;
  readonly avgDurationMs: number;
  readonly failureRatio: number;
}

export interface ApiDimensions {
  readonly device: readonly ApiDimensionRow[];
  readonly browser: readonly ApiDimensionRow[];
  readonly os: readonly ApiDimensionRow[];
  readonly version: readonly ApiDimensionRow[];
  readonly region: readonly ApiDimensionRow[];
  readonly carrier: readonly ApiDimensionRow[];
  readonly network: readonly ApiDimensionRow[];
  readonly platform: readonly ApiDimensionRow[];
}

export interface ApiOverview {
  readonly summary: ApiSummary;
  readonly statusBuckets: readonly ApiStatusBucketRatio[];
  readonly trend: readonly ApiTrendBucket[];
  readonly topSlow: readonly ApiTopSlowRow[];
  readonly topRequests: readonly ApiTopRequestRow[];
  readonly topPages: readonly ApiTopPageRow[];
  readonly topErrorStatus: readonly ApiTopErrorStatusRow[];
  readonly dimensions: ApiDimensions;
}

export interface ApiOverviewResult {
  readonly source: OverviewSource;
  readonly data: ApiOverview;
}

// ------- 常量 -------

export const STATUS_BUCKET_ORDER: readonly StatusBucket[] = [
  "2xx",
  "3xx",
  "4xx",
  "5xx",
  "0",
];

export const STATUS_BUCKET_LABEL: Record<StatusBucket, string> = {
  "2xx": "2xx 成功",
  "3xx": "3xx 重定向",
  "4xx": "4xx 客户端错误",
  "5xx": "5xx 服务端错误",
  "0": "网络失败",
  other: "其他",
};

export const STATUS_BUCKET_TONE: Record<StatusBucket, string> = {
  "2xx": "text-emerald-600",
  "3xx": "text-sky-600",
  "4xx": "text-amber-600",
  "5xx": "text-red-600",
  "0": "text-slate-500",
  other: "text-slate-500",
};

// ------- 数据获取 -------

export async function getApiOverview(
  params: { windowHours?: number } = {},
): Promise<ApiOverviewResult> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const projectId = await getActiveProjectId();
  const environment = await getActiveEnvironment();
  const qs = new URLSearchParams({ projectId, environment });
  if (params.windowHours != null && Number.isFinite(params.windowHours)) {
    qs.set("windowHours", String(params.windowHours));
  }
  const url = `${baseUrl}/dashboard/v1/api/overview?${qs.toString()}`;

  try {
    const response = await dashboardFetch(url);
    if (!response.ok) {
      console.error(
        `[api-overview] ${response.status} ${response.statusText} @ ${url}`,
      );
      return { source: "error", data: emptyApiOverview() };
    }
    const json = (await response.json()) as { data?: Partial<ApiOverview> };
    const data = normalizeOverview(json.data);
    const hasSamples = data.summary.totalRequests > 0;
    return { source: hasSamples ? "live" : "empty", data };
  } catch (err) {
    console.error(
      `[api-overview] fetch failed @ ${url} —`,
      (err as Error).message,
    );
    return { source: "error", data: emptyApiOverview() };
  }
}

function normalizeOverview(raw: Partial<ApiOverview> | undefined): ApiOverview {
  const empty = emptyApiOverview();
  if (!raw) return empty;
  return {
    summary: raw.summary ?? empty.summary,
    statusBuckets: raw.statusBuckets ?? empty.statusBuckets,
    trend: raw.trend ?? empty.trend,
    topSlow: raw.topSlow ?? empty.topSlow,
    topRequests: raw.topRequests ?? empty.topRequests,
    topPages: raw.topPages ?? empty.topPages,
    topErrorStatus: raw.topErrorStatus ?? empty.topErrorStatus,
    dimensions: raw.dimensions ?? empty.dimensions,
  };
}

export function emptyApiOverview(): ApiOverview {
  return {
    summary: {
      totalRequests: 0,
      slowCount: 0,
      failedCount: 0,
      p75DurationMs: 0,
      slowRatio: 0,
      failedRatio: 0,
      deltaPercent: 0,
      deltaDirection: "flat",
    },
    statusBuckets: STATUS_BUCKET_ORDER.map((bucket) => ({
      bucket,
      count: 0,
      ratio: 0,
    })),
    trend: [],
    topSlow: [],
    topRequests: [],
    topPages: [],
    topErrorStatus: [],
    dimensions: { device: [], browser: [], os: [], version: [], region: [], carrier: [], network: [], platform: [] },
  };
}
