import { z } from "zod";

/**
 * Dashboard API 大盘契约（ADR-0020 §4.2 / TM.1.A.4）
 *
 * 数据源：`api_events_raw`（apiPlugin 上报）；仅只读聚合视图。
 *
 * 字段组成：
 *  - summary：窗口样本 / 慢占比 / 失败率 / p75 + 环比
 *  - statusBuckets：2xx/3xx/4xx/5xx/0 五桶
 *  - trend：按小时样本量 + 慢请求数 + 失败数
 *  - topSlow：按 (method, host, pathTemplate) 分组的慢请求 Top N
 */

// ------- 请求 query -------

export const ApiOverviewQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  /** 聚合窗口（小时），默认 24，最大 168（7d） */
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
  /** topSlow 返回条数，默认 10，最大 50 */
  limitSlow: z.coerce.number().int().min(1).max(50).default(10),
  /** topRequests 返回条数（按样本量倒序），默认 10，最大 50 */
  limitTop: z.coerce.number().int().min(1).max(50).default(10),
  /** topPages 返回条数（按 page_path 聚合），默认 10，最大 50 */
  limitPages: z.coerce.number().int().min(1).max(50).default(10),
  /** topErrorStatus 返回条数（4xx/5xx/0），默认 10，最大 50 */
  limitErrorStatus: z.coerce.number().int().min(1).max(50).default(10),
  /** 每个维度 Tab 保留条数，默认 10，最大 50 */
  limitDimension: z.coerce.number().int().min(1).max(50).default(10),
  /** 环境过滤（可选，如 'production' / 'staging'） */
  environment: z.string().optional(),
});
export type ApiOverviewQuery = z.infer<typeof ApiOverviewQuerySchema>;

// ------- 响应 DTO -------

export type DeltaDirection = "up" | "down" | "flat";

/** 固定 5 个桶；'other' 非 2/3/4/5xx / 0 的容错兜底 */
export type StatusBucket = "2xx" | "3xx" | "4xx" | "5xx" | "0" | "other";

export interface ApiSummaryDto {
  readonly totalRequests: number;
  readonly slowCount: number;
  readonly failedCount: number;
  readonly p75DurationMs: number;
  /** 慢请求占比（0~1，保留 4 位小数） */
  readonly slowRatio: number;
  /** 失败占比（0~1，保留 4 位小数） */
  readonly failedRatio: number;
  /** 环比：总样本量变化方向 + 幅度（|%|，保留 1 位小数） */
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
}

export interface ApiStatusBucketDto {
  readonly bucket: StatusBucket;
  readonly count: number;
  /** 占比（0~1，保留 4 位小数） */
  readonly ratio: number;
}

export interface ApiTrendBucketDto {
  readonly hour: string;
  readonly count: number;
  readonly slowCount: number;
  readonly failedCount: number;
  /** 均耗时（毫秒，保留 2 位小数） */
  readonly avgDurationMs: number;
  /** 成功率（0~1，保留 4 位小数；status 2xx/3xx 占比） */
  readonly successRatio: number;
}

export interface ApiTopSlowDto {
  readonly method: string;
  readonly host: string;
  readonly pathTemplate: string;
  readonly sampleCount: number;
  readonly p75DurationMs: number;
  /** 失败占比（0~1，保留 4 位小数） */
  readonly failureRatio: number;
}

/** TOP 请求（按样本量倒序；与 topSlow 互补展示高频请求） */
export interface ApiTopRequestDto {
  readonly method: string;
  readonly host: string;
  readonly pathTemplate: string;
  readonly sampleCount: number;
  readonly avgDurationMs: number;
  readonly failureRatio: number;
}

/** 访问页面 TOP（按 pagePath 聚合 API 请求） */
export interface ApiTopPageDto {
  readonly pagePath: string;
  readonly requestCount: number;
  readonly avgDurationMs: number;
  readonly failedCount: number;
  readonly failureRatio: number;
}

/** HTTP 异常状态码 TOP（仅 4xx/5xx/0） */
export interface ApiTopErrorStatusDto {
  readonly status: number;
  readonly count: number;
  /** 占窗口总样本比（0~1，保留 4 位小数） */
  readonly ratio: number;
}

/** 维度分布单行（browser / os / platform 共用） */
export interface ApiDimensionRowDto {
  readonly value: string;
  readonly sampleCount: number;
  /** 占比百分比（0~100，保留 2 位小数） */
  readonly sharePercent: number;
  readonly avgDurationMs: number;
  /** 失败率（0~1，保留 4 位小数） */
  readonly failureRatio: number;
}

/**
 * 维度分布聚合结果
 *
 * 已接入：browser / os / platform（device_type）
 * 保留占位：device / browserVersion / osVersion / region / carrier / network
 * —— 待 UA-parser / GeoIP / 网络上报接入
 */
export interface ApiDimensionsDto {
  readonly browser: readonly ApiDimensionRowDto[];
  readonly os: readonly ApiDimensionRowDto[];
  readonly platform: readonly ApiDimensionRowDto[];
}

export interface ApiOverviewDto {
  readonly summary: ApiSummaryDto;
  /** 固定 5 占位（0/2xx/3xx/4xx/5xx），空数据时 count=0 */
  readonly statusBuckets: readonly ApiStatusBucketDto[];
  readonly trend: readonly ApiTrendBucketDto[];
  readonly topSlow: readonly ApiTopSlowDto[];
  readonly topRequests: readonly ApiTopRequestDto[];
  readonly topPages: readonly ApiTopPageDto[];
  readonly topErrorStatus: readonly ApiTopErrorStatusDto[];
  readonly dimensions: ApiDimensionsDto;
}
