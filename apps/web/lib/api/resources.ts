/**
 * 静态资源大盘数据契约（对齐 ADR-0022 §4 / TM.1.B.5）
 *
 * Web 层消费 server `/dashboard/v1/resources/overview`：
 *  - 失败 / 5xx → source: "error"
 *  - 空窗口（totalRequests=0）→ source: "empty"
 *  - 有样本 → source: "live"
 */

import type { OverviewSource } from "./performance";
import { getActiveProjectId, getActiveEnvironment } from "./context";
import { dashboardFetch } from "./server-fetch";

export type DeltaDirection = "up" | "down" | "flat";

/** 固定 6 类占位（顺序由后端稳定返回） */
export type ResourceCategory =
  | "script"
  | "stylesheet"
  | "image"
  | "font"
  | "media"
  | "other";

export interface ResourcesSummaryDelta {
  readonly totalRequests: number;
  readonly totalRequestsDirection: DeltaDirection;
  /** 失败率绝对差（0~1） */
  readonly failureRatio: number;
  readonly failureRatioDirection: DeltaDirection;
}

export interface ResourcesSummary {
  readonly totalRequests: number;
  readonly failedCount: number;
  readonly slowCount: number;
  readonly p75DurationMs: number;
  readonly totalTransferBytes: number;
  readonly failureRatio: number;
  readonly slowRatio: number;
  readonly delta: ResourcesSummaryDelta;
}

export interface ResourcesCategoryBucket {
  readonly category: ResourceCategory;
  readonly count: number;
  readonly failedCount: number;
  readonly slowCount: number;
  readonly avgDurationMs: number;
}

export interface ResourcesTrendBucket {
  readonly hour: string;
  readonly count: number;
  readonly failedCount: number;
  readonly slowCount: number;
  readonly avgDurationMs: number;
}

export interface ResourcesTopSlowRow {
  readonly category: ResourceCategory;
  readonly host: string;
  readonly url: string;
  readonly sampleCount: number;
  readonly p75DurationMs: number;
  readonly failureRatio: number;
}

export interface ResourcesFailingHostRow {
  readonly host: string;
  readonly totalRequests: number;
  readonly failedCount: number;
  readonly failureRatio: number;
}

export interface ResourcesOverview {
  readonly summary: ResourcesSummary;
  readonly categoryBuckets: readonly ResourcesCategoryBucket[];
  readonly trend: readonly ResourcesTrendBucket[];
  readonly topSlow: readonly ResourcesTopSlowRow[];
  readonly topFailingHosts: readonly ResourcesFailingHostRow[];
}

export interface ResourcesOverviewResult {
  readonly source: OverviewSource;
  readonly data: ResourcesOverview;
}

// ------- 常量 -------

export const RESOURCE_CATEGORY_ORDER: readonly ResourceCategory[] = [
  "script",
  "stylesheet",
  "image",
  "font",
  "media",
  "other",
];

export const RESOURCE_CATEGORY_LABEL: Record<ResourceCategory, string> = {
  script: "脚本",
  stylesheet: "样式",
  image: "图片",
  font: "字体",
  media: "音视频",
  other: "其他",
};

export const RESOURCE_CATEGORY_TONE: Record<ResourceCategory, string> = {
  script: "text-amber-600",
  stylesheet: "text-sky-600",
  image: "text-emerald-600",
  font: "text-violet-600",
  media: "text-rose-600",
  other: "text-slate-500",
};

// ------- 数据获取 -------

export async function getResourcesOverview(
  params: { windowHours?: number } = {},
): Promise<ResourcesOverviewResult> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const projectId = getActiveProjectId();
  const environment = getActiveEnvironment();
  const qs = new URLSearchParams({ projectId, environment });
  if (params.windowHours != null && Number.isFinite(params.windowHours)) {
    qs.set("windowHours", String(params.windowHours));
  }
  const url = `${baseUrl}/dashboard/v1/resources/overview?${qs.toString()}`;

  try {
    const response = await dashboardFetch(url);
    if (!response.ok) {
      console.error(
        `[resources-overview] ${response.status} ${response.statusText} @ ${url}`,
      );
      return { source: "error", data: emptyResourcesOverview() };
    }
    const json = (await response.json()) as {
      data?: Partial<ResourcesOverview>;
    };
    const data = normalizeOverview(json.data);
    const hasSamples = data.summary.totalRequests > 0;
    return { source: hasSamples ? "live" : "empty", data };
  } catch (err) {
    console.error(
      `[resources-overview] fetch failed @ ${url} —`,
      (err as Error).message,
    );
    return { source: "error", data: emptyResourcesOverview() };
  }
}

function normalizeOverview(
  raw: Partial<ResourcesOverview> | undefined,
): ResourcesOverview {
  const empty = emptyResourcesOverview();
  if (!raw) return empty;
  return {
    summary: raw.summary ?? empty.summary,
    categoryBuckets: raw.categoryBuckets ?? empty.categoryBuckets,
    trend: raw.trend ?? empty.trend,
    topSlow: raw.topSlow ?? empty.topSlow,
    topFailingHosts: raw.topFailingHosts ?? empty.topFailingHosts,
  };
}

export function emptyResourcesOverview(): ResourcesOverview {
  return {
    summary: {
      totalRequests: 0,
      failedCount: 0,
      slowCount: 0,
      p75DurationMs: 0,
      totalTransferBytes: 0,
      failureRatio: 0,
      slowRatio: 0,
      delta: {
        totalRequests: 0,
        totalRequestsDirection: "flat",
        failureRatio: 0,
        failureRatioDirection: "flat",
      },
    },
    categoryBuckets: RESOURCE_CATEGORY_ORDER.map((category) => ({
      category,
      count: 0,
      failedCount: 0,
      slowCount: 0,
      avgDurationMs: 0,
    })),
    trend: [],
    topSlow: [],
    topFailingHosts: [],
  };
}
