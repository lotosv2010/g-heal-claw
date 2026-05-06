/**
 * 埋点大盘数据契约（P0-3 §2 / TrackingOverviewDto）
 *
 * Web 层消费 server `/dashboard/v1/tracking/overview`：
 *  - 失败 / 5xx → source: "error"
 *  - 空窗口 → source: "empty"
 *  - 有样本 → source: "live"
 */

import type { OverviewSource } from "./performance";
import { getActiveProjectId, getActiveEnvironment } from "./context";
import { dashboardFetch } from "./server-fetch";

export type DeltaDirection = "up" | "down" | "flat";
export type TrackTypeBucket = "click" | "expose" | "submit" | "code";

export interface TrackSummary {
  readonly totalEvents: number;
  readonly uniqueUsers: number;
  readonly uniqueSessions: number;
  readonly uniqueEventNames: number;
  readonly eventsPerSession: number;
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
}

export interface TrackTypeBucketRow {
  readonly bucket: TrackTypeBucket;
  readonly count: number;
  readonly ratio: number;
}

export interface TrackTrendBucket {
  readonly hour: string;
  readonly count: number;
  readonly uniqueUsers: number;
}

export interface TrackTopEventRow {
  readonly eventName: string;
  readonly trackType: string;
  readonly count: number;
  readonly uniqueUsers: number;
  readonly sharePercent: number;
}

export interface TrackTopPageRow {
  readonly pagePath: string;
  readonly count: number;
  readonly uniqueUsers: number;
}

export interface TrackingOverview {
  readonly summary: TrackSummary;
  readonly typeBuckets: readonly TrackTypeBucketRow[];
  readonly trend: readonly TrackTrendBucket[];
  readonly topEvents: readonly TrackTopEventRow[];
  readonly topPages: readonly TrackTopPageRow[];
}

export interface TrackingOverviewResult {
  readonly source: OverviewSource;
  readonly data: TrackingOverview;
}

// ------- 常量 -------

export const TRACK_BUCKET_ORDER: readonly TrackTypeBucket[] = [
  "click",
  "expose",
  "submit",
  "code",
];

export const TRACK_BUCKET_LABEL: Record<TrackTypeBucket, string> = {
  click: "点击事件",
  expose: "曝光事件",
  submit: "表单提交",
  code: "代码埋点",
};

export const TRACK_BUCKET_TONE: Record<TrackTypeBucket, string> = {
  click: "text-sky-600",
  expose: "text-violet-600",
  submit: "text-emerald-600",
  code: "text-amber-600",
};

// ------- 数据获取 -------

export async function getTrackingOverview(): Promise<TrackingOverviewResult> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const projectId = getActiveProjectId();
  const environment = getActiveEnvironment();
  const qs = new URLSearchParams({ projectId, environment });
  const url = `${baseUrl}/dashboard/v1/tracking/overview?${qs.toString()}`;

  try {
    const response = await dashboardFetch(url);
    if (!response.ok) {
      console.error(
        `[tracking-overview] ${response.status} ${response.statusText} @ ${url}`,
      );
      return { source: "error", data: emptyTrackingOverview() };
    }
    const json = (await response.json()) as {
      data?: Partial<TrackingOverview>;
    };
    const data = normalizeOverview(json.data);
    const hasSamples = data.summary.totalEvents > 0;
    return { source: hasSamples ? "live" : "empty", data };
  } catch (err) {
    console.error(
      `[tracking-overview] fetch failed @ ${url} —`,
      (err as Error).message,
    );
    return { source: "error", data: emptyTrackingOverview() };
  }
}

function normalizeOverview(
  raw: Partial<TrackingOverview> | undefined,
): TrackingOverview {
  const empty = emptyTrackingOverview();
  if (!raw) return empty;
  return {
    summary: raw.summary ?? empty.summary,
    typeBuckets: raw.typeBuckets ?? empty.typeBuckets,
    trend: raw.trend ?? empty.trend,
    topEvents: raw.topEvents ?? empty.topEvents,
    topPages: raw.topPages ?? empty.topPages,
  };
}

export function emptyTrackingOverview(): TrackingOverview {
  return {
    summary: {
      totalEvents: 0,
      uniqueUsers: 0,
      uniqueSessions: 0,
      uniqueEventNames: 0,
      eventsPerSession: 0,
      deltaPercent: 0,
      deltaDirection: "flat",
    },
    typeBuckets: TRACK_BUCKET_ORDER.map((bucket) => ({
      bucket,
      count: 0,
      ratio: 0,
    })),
    trend: [],
    topEvents: [],
    topPages: [],
  };
}
