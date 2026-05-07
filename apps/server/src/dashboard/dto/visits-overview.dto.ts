import { z } from "zod";

/**
 * Dashboard Visits 大盘契约（ADR-0020 Tier 2.A）
 *
 * 数据源：`page_view_raw`（pageViewPlugin 上报）；仅只读聚合视图。
 *
 * 字段组成：
 *  - summary：PV/UV + SPA 占比 + 硬刷新占比 + 环比
 *  - trend：按小时 PV/UV
 *  - topPages：访问路径 Top N（按 PV 倒序）
 *  - topReferrers：引荐来源 Top N（空值归 "direct"）
 */

// ------- 请求 query -------

export const VisitsOverviewQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  /** 聚合窗口（小时），默认 24，最大 168（7d） */
  windowHours: z.coerce.number().int().min(1).max(720).default(24),
  environment: z.string().optional(),
  /** topPages 返回条数，默认 10，最大 50 */
  limitPages: z.coerce.number().int().min(1).max(50).default(10),
  /** topReferrers 返回条数，默认 10，最大 50 */
  limitReferrers: z.coerce.number().int().min(1).max(50).default(10),
});
export type VisitsOverviewQuery = z.infer<typeof VisitsOverviewQuerySchema>;

// ------- 响应 DTO -------

export type DeltaDirection = "up" | "down" | "flat";

export interface VisitsSummaryDto {
  readonly pv: number;
  readonly uv: number;
  readonly spaNavCount: number;
  readonly reloadCount: number;
  /** SPA 切换占比（spaNavCount / pv，0~1，保留 4 位小数） */
  readonly spaNavRatio: number;
  /** 刷新占比（reloadCount / pv，0~1，保留 4 位小数） */
  readonly reloadRatio: number;
  /** 环比 PV 变化方向 + 幅度（|%|，保留 1 位小数） */
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
}

export interface VisitsTrendBucketDto {
  readonly hour: string;
  readonly pv: number;
  readonly uv: number;
}

export interface VisitsTopPageDto {
  readonly path: string;
  readonly pv: number;
  readonly uv: number;
  /** 占窗口总 PV 百分比（0~100，保留 2 位小数） */
  readonly sharePercent: number;
}

export interface VisitsTopReferrerDto {
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
  readonly device: readonly VisitsDimensionRow[];
  readonly browser: readonly VisitsDimensionRow[];
  readonly os: readonly VisitsDimensionRow[];
  readonly version: readonly VisitsDimensionRow[];
  readonly region: readonly VisitsDimensionRow[];
  readonly carrier: readonly VisitsDimensionRow[];
  readonly network: readonly VisitsDimensionRow[];
  readonly platform: readonly VisitsDimensionRow[];
}

export interface VisitsOverviewDto {
  readonly summary: VisitsSummaryDto;
  readonly trend: readonly VisitsTrendBucketDto[];
  readonly topPages: readonly VisitsTopPageDto[];
  readonly topReferrers: readonly VisitsTopReferrerDto[];
  readonly dimensions: VisitsDimensions;
}
