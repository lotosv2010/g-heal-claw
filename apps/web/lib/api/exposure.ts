/**
 * 曝光大盘数据契约（ADR-0024 / ExposureOverviewDto）
 *
 * Web 层消费 server `/dashboard/v1/tracking/exposure/overview`：
 *  - 失败 / 5xx → source: "error"
 *  - 空窗口 → source: "empty"
 *  - 有样本 → source: "live"
 */

import type { OverviewSource } from "./performance";
import { getActiveProjectId, getActiveEnvironment } from "./context";
import { dashboardFetch } from "./server-fetch";

export type DeltaDirection = "up" | "down" | "flat";

export interface ExposureSummary {
  readonly totalExposures: number;
  readonly uniqueSelectors: number;
  readonly uniquePages: number;
  readonly uniqueUsers: number;
  readonly exposuresPerUser: number;
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
}

export interface ExposureTrendBucket {
  readonly hour: string;
  readonly count: number;
  readonly uniqueUsers: number;
}

export interface ExposureTopSelectorRow {
  readonly selector: string;
  readonly sampleText: string | null;
  readonly count: number;
  readonly uniqueUsers: number;
  readonly uniquePages: number;
  readonly sharePercent: number;
}

export interface ExposureTopPageRow {
  readonly pagePath: string;
  readonly count: number;
  readonly uniqueUsers: number;
}

export interface ExposureOverview {
  readonly summary: ExposureSummary;
  readonly trend: readonly ExposureTrendBucket[];
  readonly topSelectors: readonly ExposureTopSelectorRow[];
  readonly topPages: readonly ExposureTopPageRow[];
}

export interface ExposureOverviewResult {
  readonly source: OverviewSource;
  readonly data: ExposureOverview;
}

// ------- 数据获取 -------

export async function getExposureOverview(
  params: { windowHours?: number } = {},
): Promise<ExposureOverviewResult> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const projectId = getActiveProjectId();
  const environment = getActiveEnvironment();
  const qs = new URLSearchParams({ projectId, environment });
  if (params.windowHours != null && Number.isFinite(params.windowHours)) {
    qs.set("windowHours", String(params.windowHours));
  }
  const url = `${baseUrl}/dashboard/v1/tracking/exposure/overview?${qs.toString()}`;

  try {
    const response = await dashboardFetch(url);
    if (!response.ok) {
      console.error(
        `[exposure-overview] ${response.status} ${response.statusText} @ ${url}`,
      );
      return { source: "error", data: emptyExposureOverview() };
    }
    const json = (await response.json()) as {
      data?: Partial<ExposureOverview>;
    };
    const data = normalizeOverview(json.data);
    const hasSamples = data.summary.totalExposures > 0;
    return { source: hasSamples ? "live" : "empty", data };
  } catch (err) {
    console.error(
      `[exposure-overview] fetch failed @ ${url} —`,
      (err as Error).message,
    );
    return { source: "error", data: emptyExposureOverview() };
  }
}

function normalizeOverview(
  raw: Partial<ExposureOverview> | undefined,
): ExposureOverview {
  const empty = emptyExposureOverview();
  if (!raw) return empty;
  return {
    summary: raw.summary ?? empty.summary,
    trend: raw.trend ?? empty.trend,
    topSelectors: raw.topSelectors ?? empty.topSelectors,
    topPages: raw.topPages ?? empty.topPages,
  };
}

export function emptyExposureOverview(): ExposureOverview {
  return {
    summary: {
      totalExposures: 0,
      uniqueSelectors: 0,
      uniquePages: 0,
      uniqueUsers: 0,
      exposuresPerUser: 0,
      deltaPercent: 0,
      deltaDirection: "flat",
    },
    trend: [],
    topSelectors: [],
    topPages: [],
  };
}
