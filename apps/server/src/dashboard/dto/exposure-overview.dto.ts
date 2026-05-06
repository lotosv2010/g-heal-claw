import { z } from "zod";

/**
 * Dashboard 曝光大盘契约（ADR-0024 / tracking/exposure 切片）
 *
 * 数据源：`track_events_raw` 中 `track_type='expose'` 子集，由 `trackPlugin`
 * 在 IntersectionObserver 命中且停留 ≥ `exposeDwellMs` 后写入。本端点不引入新
 * schema，仅做只读聚合视图。
 *
 * 字段组成：
 *  - summary：窗口总曝光 / 去重元素 / 去重页面 / 去重用户 + 环比
 *  - trend：按小时曝光 + 去重用户
 *  - topSelectors：按 selector（回落 event_name）Top N
 *  - topPages：按 page_path Top N
 */

// ------- 请求 query -------

export const ExposureOverviewQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  /** 聚合窗口（小时），默认 24，最大 168（7d） */
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
  environment: z.string().optional(),
  /** topSelectors 返回条数，默认 10，最大 50 */
  limitSelectors: z.coerce.number().int().min(1).max(50).default(10),
  /** topPages 返回条数，默认 10，最大 50 */
  limitPages: z.coerce.number().int().min(1).max(50).default(10),
});
export type ExposureOverviewQuery = z.infer<typeof ExposureOverviewQuerySchema>;

// ------- 响应 DTO -------

export type DeltaDirection = "up" | "down" | "flat";

export interface ExposureSummaryDto {
  readonly totalExposures: number;
  readonly uniqueSelectors: number;
  readonly uniquePages: number;
  readonly uniqueUsers: number;
  /** 每会话/用户平均曝光数（保留 2 位小数） */
  readonly exposuresPerUser: number;
  /** 环比：总曝光量变化方向 + 幅度（|%|，保留 1 位小数） */
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
}

export interface ExposureTrendBucketDto {
  readonly hour: string;
  readonly count: number;
  readonly uniqueUsers: number;
}

export interface ExposureTopSelectorDto {
  readonly selector: string;
  /** 代表性样本文案（同 selector 的 target_text 最大值，≤ 200） */
  readonly sampleText: string | null;
  readonly count: number;
  readonly uniqueUsers: number;
  readonly uniquePages: number;
  /** 占窗口总曝光比例（0~100，保留 2 位小数） */
  readonly sharePercent: number;
}

export interface ExposureTopPageDto {
  readonly pagePath: string;
  readonly count: number;
  readonly uniqueUsers: number;
}

export interface ExposureOverviewDto {
  readonly summary: ExposureSummaryDto;
  readonly trend: readonly ExposureTrendBucketDto[];
  readonly topSelectors: readonly ExposureTopSelectorDto[];
  readonly topPages: readonly ExposureTopPageDto[];
}
