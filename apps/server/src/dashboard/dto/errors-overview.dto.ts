import { z } from "zod";

/**
 * Dashboard 异常大盘 API 契约（ADR-0016 §3 + SPEC 9 分类扩展）
 *
 * 面向 Web 前端：server 已承担 9 分类拆分（resource 依赖 resource_kind 列）
 * 和 8 维度聚合，前端只做 UI 渲染。
 *
 * 字段演进：
 *  - v1：summary + bySubType(5) + trend(5) + topGroups
 *  - v2（当前）：在 v1 基础上追加 categories(9) + categoryTrend(9) + dimensions(8)；
 *    旧字段保留以便灰度切换，由 Web 层决定使用哪个视图。
 */

// ------- 请求 query -------

export const ErrorsOverviewQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  /** 聚合窗口（小时），默认 24，最大 168（7d） */
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
  /** topGroups 返回条数，默认 10，最大 50 */
  limitGroups: z.coerce.number().int().min(1).max(50).default(10),
  /** 环境过滤（可选，如 'production' / 'staging'） */
  environment: z.string().optional(),
});
export type ErrorsOverviewQuery = z.infer<typeof ErrorsOverviewQuerySchema>;

// ------- 响应 DTO -------

/** 与 ErrorEventSchema.subType 同构（共 7 种：新增 ajax / api_code） */
export type ErrorSubType =
  | "js"
  | "promise"
  | "resource"
  | "framework"
  | "white_screen"
  | "ajax"
  | "api_code";

/** SPEC 9 分类卡片/堆叠图视图（后端已拆分，前端直接消费） */
export type ErrorCategory =
  | "js"
  | "promise"
  | "white_screen"
  | "ajax"
  | "js_load"
  | "image_load"
  | "css_load"
  | "media"
  | "api_code";

/** 8 维度 tab 键（SPEC：机型/浏览器/操作系统/版本/地域/运营商/网络/平台） */
export type ErrorDimensionKey =
  | "device"
  | "browser"
  | "os"
  | "version"
  | "region"
  | "carrier"
  | "network"
  | "platform";

export type DeltaDirection = "up" | "down" | "flat";

export interface ErrorSummaryDto {
  readonly totalEvents: number;
  readonly impactedSessions: number;
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
}

/** 旧 5 分类占位（v1 字段，保留兼容） */
export interface ErrorSubTypeDto {
  readonly subType: ErrorSubType;
  readonly count: number;
  readonly ratio: number;
}

/** 旧 5 分类 trend（v1 字段，保留兼容） */
export interface ErrorTrendBucketDto {
  readonly hour: string;
  readonly total: number;
  readonly js: number;
  readonly promise: number;
  readonly resource: number;
  readonly framework: number;
  readonly whiteScreen: number;
}

/** 9 分类卡片计数 */
export interface ErrorCategoryDto {
  readonly category: ErrorCategory;
  readonly count: number;
  readonly ratio: number;
}

/** 9 分类堆叠图桶 */
export interface ErrorCategoryTrendBucketDto {
  readonly hour: string;
  readonly total: number;
  readonly js: number;
  readonly promise: number;
  readonly whiteScreen: number;
  readonly ajax: number;
  readonly jsLoad: number;
  readonly imageLoad: number;
  readonly cssLoad: number;
  readonly media: number;
  readonly apiCode: number;
}

export interface ErrorTopGroupDto {
  readonly subType: ErrorSubType;
  readonly category: ErrorCategory;
  readonly messageHead: string;
  readonly count: number;
  readonly impactedSessions: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly sampleUrl: string;
}

/** 维度分布行 */
export interface ErrorDimensionRowDto {
  readonly value: string;
  readonly count: number;
  /** 占比（0~100，保留 2 位小数） */
  readonly sharePercent: number;
  readonly impactedSessions: number;
}

/** 8 维度聚合；未采集的维度返回空数组（前端展示"待采集"占位） */
export type ErrorDimensionsDto = Readonly<
  Record<ErrorDimensionKey, readonly ErrorDimensionRowDto[]>
>;

export interface ErrorOverviewDto {
  readonly summary: ErrorSummaryDto;
  /** v1：5 分类（兼容） */
  readonly bySubType: readonly ErrorSubTypeDto[];
  /** v1：5 分类 trend（兼容） */
  readonly trend: readonly ErrorTrendBucketDto[];
  /** v2：9 分类卡片 */
  readonly categories: readonly ErrorCategoryDto[];
  /** v2：9 分类堆叠图 */
  readonly categoryTrend: readonly ErrorCategoryTrendBucketDto[];
  /** v2：8 维度聚合 */
  readonly dimensions: ErrorDimensionsDto;
  readonly topGroups: readonly ErrorTopGroupDto[];
}
