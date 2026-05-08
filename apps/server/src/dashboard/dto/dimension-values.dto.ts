import { z } from "zod";
import { DIMENSION_KEYS } from "@g-heal-claw/shared";

/**
 * 维度值枚举 API 契约
 *
 * 前端筛选器下拉需要知道各维度的可选值列表。
 * 按事件表维度列 distinct + count 取 Top N。
 */

export const DimensionValuesQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  /** 要查询的维度 key */
  dimension: z.enum(DIMENSION_KEYS),
  /** 聚合窗口（小时），默认 24 */
  windowHours: z.coerce.number().int().min(1).max(720).default(24),
  /** 返回条数上限，默认 50 */
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** 数据源表（可选，默认 error_events_raw；前端按当前页面选择） */
  source: z.enum([
    "error_events_raw",
    "api_events_raw",
    "perf_events_raw",
    "resource_events_raw",
    "page_view_raw",
  ]).default("error_events_raw"),
  /** 环境过滤 */
  environment: z.string().optional(),
});
export type DimensionValuesQuery = z.infer<typeof DimensionValuesQuerySchema>;

export interface DimensionValueItem {
  readonly value: string;
  readonly count: number;
}

export interface DimensionValuesResponse {
  readonly dimension: string;
  readonly values: DimensionValueItem[];
}
