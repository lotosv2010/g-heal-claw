/**
 * 自定义上报大盘数据契约（对齐 ADR-0023 §4 / TM.1.C.5）
 *
 * Web 层消费 server `/dashboard/v1/custom/overview`：
 *  - 失败 / 5xx → source: "error"
 *  - 空窗口（totalEvents=0 && totalSamples=0）→ source: "empty"
 *  - 有样本 → source: "live"
 */

import type { OverviewSource } from "./performance";

export type DeltaDirection = "up" | "down" | "flat";

export interface CustomSummaryDelta {
  readonly totalEvents: number;
  readonly totalEventsDirection: DeltaDirection;
  readonly totalSamples: number;
  readonly totalSamplesDirection: DeltaDirection;
}

export interface CustomSummary {
  readonly totalEvents: number;
  readonly distinctEventNames: number;
  readonly topEventName: string | null;
  readonly avgEventsPerSession: number;
  readonly totalSamples: number;
  readonly distinctMetricNames: number;
  readonly globalP75DurationMs: number;
  readonly globalP95DurationMs: number;
  readonly delta: CustomSummaryDelta;
}

export interface CustomEventTop {
  readonly name: string;
  readonly count: number;
  readonly lastSeenMs: number;
}

export interface CustomMetricTop {
  readonly name: string;
  readonly count: number;
  readonly p50DurationMs: number;
  readonly p75DurationMs: number;
  readonly p95DurationMs: number;
  readonly avgDurationMs: number;
}

export interface CustomEventTrendBucket {
  readonly hour: string;
  readonly count: number;
}

export interface CustomMetricTrendBucket {
  readonly hour: string;
  readonly count: number;
  readonly avgDurationMs: number;
}

export interface CustomTopPage {
  readonly pagePath: string;
  readonly count: number;
}

export interface CustomOverview {
  readonly summary: CustomSummary;
  readonly eventsTopN: readonly CustomEventTop[];
  readonly metricsTopN: readonly CustomMetricTop[];
  readonly eventsTrend: readonly CustomEventTrendBucket[];
  readonly metricsTrend: readonly CustomMetricTrendBucket[];
  readonly topPages: readonly CustomTopPage[];
}

export interface CustomOverviewResult {
  readonly source: OverviewSource;
  readonly data: CustomOverview;
}

// ------- 数据获取 -------

export async function getCustomOverview(): Promise<CustomOverviewResult> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const projectId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "demo";
  const url = `${baseUrl}/dashboard/v1/custom/overview?projectId=${encodeURIComponent(
    projectId,
  )}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      console.error(
        `[custom-overview] ${response.status} ${response.statusText} @ ${url}`,
      );
      return { source: "error", data: emptyCustomOverview() };
    }
    const json = (await response.json()) as {
      data?: Partial<CustomOverview>;
    };
    const data = normalizeOverview(json.data);
    const hasSamples =
      data.summary.totalEvents > 0 || data.summary.totalSamples > 0;
    return { source: hasSamples ? "live" : "empty", data };
  } catch (err) {
    console.error(
      `[custom-overview] fetch failed @ ${url} —`,
      (err as Error).message,
    );
    return { source: "error", data: emptyCustomOverview() };
  }
}

function normalizeOverview(
  raw: Partial<CustomOverview> | undefined,
): CustomOverview {
  const empty = emptyCustomOverview();
  if (!raw) return empty;
  return {
    summary: raw.summary ?? empty.summary,
    eventsTopN: raw.eventsTopN ?? empty.eventsTopN,
    metricsTopN: raw.metricsTopN ?? empty.metricsTopN,
    eventsTrend: raw.eventsTrend ?? empty.eventsTrend,
    metricsTrend: raw.metricsTrend ?? empty.metricsTrend,
    topPages: raw.topPages ?? empty.topPages,
  };
}

export function emptyCustomOverview(): CustomOverview {
  return {
    summary: {
      totalEvents: 0,
      distinctEventNames: 0,
      topEventName: null,
      avgEventsPerSession: 0,
      totalSamples: 0,
      distinctMetricNames: 0,
      globalP75DurationMs: 0,
      globalP95DurationMs: 0,
      delta: {
        totalEvents: 0,
        totalEventsDirection: "flat",
        totalSamples: 0,
        totalSamplesDirection: "flat",
      },
    },
    eventsTopN: [],
    metricsTopN: [],
    eventsTrend: [],
    metricsTrend: [],
    topPages: [],
  };
}
