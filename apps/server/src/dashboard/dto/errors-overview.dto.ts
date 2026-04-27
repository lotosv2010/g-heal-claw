import { z } from "zod";

/**
 * Dashboard 异常大盘 API 契约（ADR-0016 §3）
 *
 * 与 `apps/web/lib/api/errors.ts` 的 ErrorOverview 字段形状保持一致；
 * 前后端类型刻意不共享，保留字段命名演进自由度，待 Phase 6 稳定后再抽入 shared。
 */

// ------- 请求 query -------

export const ErrorsOverviewQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  /** 聚合窗口（小时），默认 24，最大 168（7d） */
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
  /** topGroups 返回条数，默认 10，最大 50 */
  limitGroups: z.coerce.number().int().min(1).max(50).default(10),
});
export type ErrorsOverviewQuery = z.infer<typeof ErrorsOverviewQuerySchema>;

// ------- 响应 DTO -------

/** 与 ErrorEventSchema.subType 同构 */
export type ErrorSubType =
  | "js"
  | "promise"
  | "resource"
  | "framework"
  | "white_screen";

export type DeltaDirection = "up" | "down" | "flat";

export interface ErrorSummaryDto {
  readonly totalEvents: number;
  readonly impactedSessions: number;
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
}

export interface ErrorSubTypeDto {
  readonly subType: ErrorSubType;
  readonly count: number;
  readonly ratio: number;
}

export interface ErrorTrendBucketDto {
  readonly hour: string;
  readonly total: number;
  readonly js: number;
  readonly promise: number;
  readonly resource: number;
  readonly framework: number;
  readonly whiteScreen: number;
}

export interface ErrorTopGroupDto {
  readonly subType: ErrorSubType;
  readonly messageHead: string;
  readonly count: number;
  readonly impactedSessions: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly sampleUrl: string;
}

export interface ErrorOverviewDto {
  readonly summary: ErrorSummaryDto;
  readonly bySubType: readonly ErrorSubTypeDto[];
  readonly trend: readonly ErrorTrendBucketDto[];
  readonly topGroups: readonly ErrorTopGroupDto[];
}
