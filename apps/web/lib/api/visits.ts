/**
 * 页面访问大盘数据契约（对齐 ADR-0020 Tier 2.A / TM.2.A.5）
 *
 * Web 层消费 server `/dashboard/v1/visits/overview`：
 *  - 失败 / 5xx → source: "error"
 *  - 空窗口 → source: "empty"
 *  - 有样本 → source: "live"
 */

import type { OverviewSource } from "./performance";
import { getActiveProjectId, getActiveEnvironment } from "./context";
import { dashboardFetch } from "./server-fetch";

export type DeltaDirection = "up" | "down" | "flat";

export interface VisitsSummary {
  readonly pv: number;
  readonly uv: number;
  readonly spaNavCount: number;
  readonly reloadCount: number;
  readonly spaNavRatio: number;
  readonly reloadRatio: number;
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
}

export interface VisitsTrendBucket {
  readonly hour: string;
  readonly pv: number;
  readonly uv: number;
}

export interface VisitsTopPageRow {
  readonly path: string;
  readonly pv: number;
  readonly uv: number;
  readonly sharePercent: number;
}

export interface VisitsTopReferrerRow {
  readonly referrerHost: string;
  readonly pv: number;
  readonly sharePercent: number;
}

export interface VisitsDimensionRow {
  readonly value: string;
  readonly pv: number;
  readonly uv: number;
  readonly sharePercent: number;
}

export interface VisitsDimensions {
  readonly browser: readonly VisitsDimensionRow[];
  readonly os: readonly VisitsDimensionRow[];
  readonly platform: readonly VisitsDimensionRow[];
}

export interface VisitsOverview {
  readonly summary: VisitsSummary;
  readonly trend: readonly VisitsTrendBucket[];
  readonly topPages: readonly VisitsTopPageRow[];
  readonly topReferrers: readonly VisitsTopReferrerRow[];
  readonly dimensions: VisitsDimensions;
}

export interface VisitsOverviewResult {
  readonly source: OverviewSource;
  readonly data: VisitsOverview;
}

// ------- 数据获取 -------

export async function getVisitsOverview(
  params: { windowHours?: number } = {},
): Promise<VisitsOverviewResult> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const projectId = await getActiveProjectId();
  const environment = await getActiveEnvironment();
  const qs = new URLSearchParams({ projectId, environment });
  if (params.windowHours != null && Number.isFinite(params.windowHours)) {
    qs.set("windowHours", String(params.windowHours));
  }
  const url = `${baseUrl}/dashboard/v1/visits/overview?${qs.toString()}`;

  try {
    const response = await dashboardFetch(url);
    if (!response.ok) {
      console.error(
        `[visits-overview] ${response.status} ${response.statusText} @ ${url}`,
      );
      return { source: "error", data: emptyVisitsOverview() };
    }
    const json = (await response.json()) as { data?: Partial<VisitsOverview> };
    const data = normalizeOverview(json.data);
    const hasSamples = data.summary.pv > 0;
    return { source: hasSamples ? "live" : "empty", data };
  } catch (err) {
    console.error(
      `[visits-overview] fetch failed @ ${url} —`,
      (err as Error).message,
    );
    return { source: "error", data: emptyVisitsOverview() };
  }
}

function normalizeOverview(
  raw: Partial<VisitsOverview> | undefined,
): VisitsOverview {
  const empty = emptyVisitsOverview();
  if (!raw) return empty;
  return {
    summary: raw.summary ?? empty.summary,
    trend: raw.trend ?? empty.trend,
    topPages: raw.topPages ?? empty.topPages,
    topReferrers: raw.topReferrers ?? empty.topReferrers,
    dimensions: raw.dimensions ?? empty.dimensions,
  };
}

export function emptyVisitsOverview(): VisitsOverview {
  return {
    summary: {
      pv: 0,
      uv: 0,
      spaNavCount: 0,
      reloadCount: 0,
      spaNavRatio: 0,
      reloadRatio: 0,
      deltaPercent: 0,
      deltaDirection: "flat",
    },
    trend: [],
    topPages: [],
    topReferrers: [],
    dimensions: { browser: [], os: [], platform: [] },
  };
}
