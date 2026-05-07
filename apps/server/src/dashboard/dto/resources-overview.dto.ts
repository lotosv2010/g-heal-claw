import { z } from "zod";

/**
 * Dashboard Resources 大盘契约（ADR-0022 §4 / TM.1.B.4）
 *
 * 数据源：`resource_events_raw`（resourcePlugin 上报）；仅只读聚合视图。
 *
 * 字段组成：
 *  - summary：窗口样本 / 失败 / 慢 / p75 / 传输字节 + 环比
 *  - categoryBuckets：script/stylesheet/image/font/media/other 6 类固定占位
 *  - trend：按小时样本 + 失败 + 慢 + 均耗时
 *  - topSlow：按 (category, host, url) 分组 Top N（p75 倒序）
 *  - topFailingHosts：按 host 分组 Top N（failureRatio 倒序）
 */

// ------- 请求 query -------

export const ResourcesOverviewQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  /** 聚合窗口（小时），默认 24，最大 168（7d） */
  windowHours: z.coerce.number().int().min(1).max(720).default(24),
  /** topSlow 返回条数，默认 10，最大 50 */
  limitSlow: z.coerce.number().int().min(1).max(50).default(10),
  /** topFailingHosts 返回条数，默认 10，最大 50 */
  limitHosts: z.coerce.number().int().min(1).max(50).default(10),
  /** 环境过滤（可选，如 'production' / 'staging'） */
  environment: z.string().optional(),
});
export type ResourcesOverviewQuery = z.infer<
  typeof ResourcesOverviewQuerySchema
>;

// ------- 响应 DTO -------

export type DeltaDirection = "up" | "down" | "flat";

/** 固定 6 类；顺序由后端稳定返回 */
export type ResourceCategoryBucket =
  | "script"
  | "stylesheet"
  | "image"
  | "font"
  | "media"
  | "other";

export interface ResourcesSummaryDeltaDto {
  /** 总样本环比：|%|，保留 1 位小数 */
  readonly totalRequests: number;
  readonly totalRequestsDirection: DeltaDirection;
  /** 失败率环比：当前失败率 - 上一窗口失败率（绝对值，0~1，保留 4 位小数） */
  readonly failureRatio: number;
  readonly failureRatioDirection: DeltaDirection;
}

export interface ResourcesSummaryDto {
  readonly totalRequests: number;
  readonly failedCount: number;
  readonly slowCount: number;
  readonly p75DurationMs: number;
  readonly totalTransferBytes: number;
  /** 失败占比（0~1，保留 4 位小数） */
  readonly failureRatio: number;
  /** 慢占比（0~1，保留 4 位小数） */
  readonly slowRatio: number;
  readonly delta: ResourcesSummaryDeltaDto;
}

export interface ResourcesCategoryBucketDto {
  readonly category: ResourceCategoryBucket;
  readonly count: number;
  readonly failedCount: number;
  readonly slowCount: number;
  /** 均耗时（毫秒，保留 2 位小数） */
  readonly avgDurationMs: number;
}

export interface ResourcesTrendBucketDto {
  readonly hour: string;
  readonly count: number;
  readonly failedCount: number;
  readonly slowCount: number;
  readonly avgDurationMs: number;
}

export interface ResourcesTopSlowDto {
  readonly category: ResourceCategoryBucket;
  readonly host: string;
  readonly url: string;
  readonly sampleCount: number;
  readonly p75DurationMs: number;
  /** 失败占比（0~1，保留 4 位小数） */
  readonly failureRatio: number;
}

export interface ResourcesFailingHostDto {
  readonly host: string;
  readonly totalRequests: number;
  readonly failedCount: number;
  readonly failureRatio: number;
}

export interface ResourcesDimensionRow {
  readonly value: string;
  readonly sampleCount: number;
  readonly sharePercent: number;
  readonly avgDurationMs: number;
  readonly failureRatio: number;
}

export interface ResourcesDimensions {
  readonly device: readonly ResourcesDimensionRow[];
  readonly browser: readonly ResourcesDimensionRow[];
  readonly os: readonly ResourcesDimensionRow[];
  readonly version: readonly ResourcesDimensionRow[];
  readonly region: readonly ResourcesDimensionRow[];
  readonly carrier: readonly ResourcesDimensionRow[];
  readonly network: readonly ResourcesDimensionRow[];
  readonly platform: readonly ResourcesDimensionRow[];
}

export interface ResourcesOverviewDto {
  readonly summary: ResourcesSummaryDto;
  /** 固定 6 类占位，顺序：script → stylesheet → image → font → media → other */
  readonly categoryBuckets: readonly ResourcesCategoryBucketDto[];
  readonly trend: readonly ResourcesTrendBucketDto[];
  readonly topSlow: readonly ResourcesTopSlowDto[];
  readonly topFailingHosts: readonly ResourcesFailingHostDto[];
  readonly dimensions: ResourcesDimensions;
}
