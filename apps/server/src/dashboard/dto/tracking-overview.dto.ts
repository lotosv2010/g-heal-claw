import { z } from "zod";

/**
 * Dashboard 埋点大盘契约（P0-3 §2）
 *
 * 数据源：`track_events_raw`（trackPlugin 上报）；仅只读聚合视图。
 *
 * 字段组成：
 *  - summary：窗口事件总数 / 去重用户 / 去重 session / 去重事件名 + 环比
 *  - typeBuckets：code / click / expose / submit 四桶
 *  - trend：按小时事件数 + 去重用户
 *  - topEvents：按事件名倒序 Top N
 *  - topPages：按 page_path 聚合 Top N
 */

// ------- 请求 query -------

export const TrackingOverviewQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  /** 聚合窗口（小时），默认 24，最大 168（7d） */
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
  environment: z.string().optional(),
  /** topEvents 返回条数，默认 10，最大 50 */
  limitEvents: z.coerce.number().int().min(1).max(50).default(10),
  /** topPages 返回条数，默认 10，最大 50 */
  limitPages: z.coerce.number().int().min(1).max(50).default(10),
});
export type TrackingOverviewQuery = z.infer<typeof TrackingOverviewQuerySchema>;

// ------- 响应 DTO -------

export type DeltaDirection = "up" | "down" | "flat";

/** 固定 4 个桶 */
export type TrackTypeBucket = "code" | "click" | "expose" | "submit";

export interface TrackSummaryDto {
  readonly totalEvents: number;
  readonly uniqueUsers: number;
  readonly uniqueSessions: number;
  readonly uniqueEventNames: number;
  /** 每会话平均事件数（保留 2 位小数） */
  readonly eventsPerSession: number;
  /** 环比：总事件量变化方向 + 幅度（|%|，保留 1 位小数） */
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
}

export interface TrackTypeBucketDto {
  readonly bucket: TrackTypeBucket;
  readonly count: number;
  /** 占比（0~1，保留 4 位小数） */
  readonly ratio: number;
}

export interface TrackTrendBucketDto {
  readonly hour: string;
  readonly count: number;
  readonly uniqueUsers: number;
}

export interface TrackTopEventDto {
  readonly eventName: string;
  readonly trackType: string;
  readonly count: number;
  readonly uniqueUsers: number;
  /** 占窗口总事件比例（0~100，保留 2 位小数） */
  readonly sharePercent: number;
}

export interface TrackTopPageDto {
  readonly pagePath: string;
  readonly count: number;
  readonly uniqueUsers: number;
}

export interface TrackingOverviewDto {
  readonly summary: TrackSummaryDto;
  /** 固定 4 占位：click / expose / submit / code */
  readonly typeBuckets: readonly TrackTypeBucketDto[];
  readonly trend: readonly TrackTrendBucketDto[];
  readonly topEvents: readonly TrackTopEventDto[];
  readonly topPages: readonly TrackTopPageDto[];
}
