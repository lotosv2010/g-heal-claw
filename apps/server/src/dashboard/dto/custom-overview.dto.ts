import { z } from "zod";

/**
 * Dashboard Custom 大盘契约（ADR-0023 §4 / TM.1.C.4）
 *
 * 数据源：`custom_events_raw` + `custom_metrics_raw`（customPlugin 主动上报）
 *
 * 字段组成：
 *  - summary：事件总数 + 事件名基数 + 最热事件名 + 事件平均每会话次数 + 指标总样本 + 指标分位数 + 环比
 *  - eventsTopN：按 name 分组 Top N（count 倒序）
 *  - metricsTopN：按 name 分组 Top N（p75 倒序）
 *  - eventsTrend / metricsTrend：按小时双轨趋势
 *  - topPages：按 page_path 分组 Top N（事件计数倒序）
 */

// ------- 请求 query -------

export const CustomOverviewQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  /** 聚合窗口（小时），默认 24，最大 168（7d） */
  windowHours: z.coerce.number().int().min(1).max(720).default(24),
  environment: z.string().optional(),
  /** eventsTopN 条数，默认 10，最大 50 */
  limitEvents: z.coerce.number().int().min(1).max(50).default(10),
  /** metricsTopN 条数，默认 10，最大 50 */
  limitMetrics: z.coerce.number().int().min(1).max(50).default(10),
  /** topPages 条数，默认 10，最大 50 */
  limitPages: z.coerce.number().int().min(1).max(50).default(10),
});
export type CustomOverviewQuery = z.infer<typeof CustomOverviewQuerySchema>;

// ------- 响应 DTO -------

export type DeltaDirection = "up" | "down" | "flat";

export interface CustomSummaryDeltaDto {
  /** 事件总数环比：|%|，保留 1 位小数 */
  readonly totalEvents: number;
  readonly totalEventsDirection: DeltaDirection;
  /** 指标总样本环比：|%|，保留 1 位小数 */
  readonly totalSamples: number;
  readonly totalSamplesDirection: DeltaDirection;
}

export interface CustomSummaryDto {
  /** 事件 */
  readonly totalEvents: number;
  readonly distinctEventNames: number;
  readonly topEventName: string | null;
  /** 平均每会话事件数，保留 2 位小数 */
  readonly avgEventsPerSession: number;
  /** 指标 */
  readonly totalSamples: number;
  readonly distinctMetricNames: number;
  /** 全局 p75（毫秒，保留 2 位小数） */
  readonly globalP75DurationMs: number;
  /** 全局 p95（毫秒，保留 2 位小数） */
  readonly globalP95DurationMs: number;
  readonly delta: CustomSummaryDeltaDto;
}

export interface CustomEventTopDto {
  readonly name: string;
  readonly count: number;
  readonly lastSeenMs: number;
}

export interface CustomMetricTopDto {
  readonly name: string;
  readonly count: number;
  readonly p50DurationMs: number;
  readonly p75DurationMs: number;
  readonly p95DurationMs: number;
  readonly avgDurationMs: number;
}

export interface CustomEventTrendBucketDto {
  readonly hour: string;
  readonly count: number;
}

export interface CustomMetricTrendBucketDto {
  readonly hour: string;
  readonly count: number;
  readonly avgDurationMs: number;
}

export interface CustomTopPageDto {
  readonly pagePath: string;
  readonly count: number;
}

export interface CustomOverviewDto {
  readonly summary: CustomSummaryDto;
  readonly eventsTopN: readonly CustomEventTopDto[];
  readonly metricsTopN: readonly CustomMetricTopDto[];
  readonly eventsTrend: readonly CustomEventTrendBucketDto[];
  readonly metricsTrend: readonly CustomMetricTrendBucketDto[];
  readonly topPages: readonly CustomTopPageDto[];
}
