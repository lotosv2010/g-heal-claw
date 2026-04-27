import { z } from "zod";

/**
 * Dashboard 性能大盘 API 契约（ADR-0015）
 *
 * 与 `apps/web/lib/api/performance.ts` 的 PerformanceOverview 字段形状保持一致；
 * 前后端类型刻意不共享，保留字段命名演进自由度，待 Phase 6 稳定后再抽入 shared。
 */

// ------- 请求 query -------

export const OverviewQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  /** 聚合窗口（小时），默认 24，最大 168（7d） */
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
  /** 慢页面返回条数，默认 10，最大 50 */
  limitSlowPages: z.coerce.number().int().min(1).max(50).default(10),
});
export type OverviewQuery = z.infer<typeof OverviewQuerySchema>;

// ------- 响应 DTO（与 web 的 PerformanceOverview 对齐） -------

export type VitalKey = "LCP" | "FCP" | "CLS" | "INP" | "TTFB";
/** 与 shadcn Badge variant 对齐；destructive = Web Vitals "poor" */
export type ThresholdTone = "good" | "warn" | "destructive";
export type DeltaDirection = "up" | "down" | "flat";

export interface VitalMetricDto {
  readonly key: VitalKey;
  readonly value: number;
  readonly unit: "ms" | "";
  readonly tone: ThresholdTone;
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
  readonly sampleCount: number;
}

export type LoadStageKey =
  | "dns"
  | "tcp"
  | "ssl"
  | "request"
  | "response"
  | "domParse"
  | "resourceLoad"
  | "firstScreen"
  | "lcp";

export interface LoadStageDto {
  readonly key: LoadStageKey;
  readonly label: string;
  readonly ms: number;
  readonly startMs: number;
  readonly endMs: number;
}

export interface TrendBucketDto {
  readonly hour: string;
  readonly lcpP75: number;
  readonly fcpP75: number;
  readonly inpP75: number;
  readonly ttfbP75: number;
}

export interface SlowPageDto {
  readonly url: string;
  readonly sampleCount: number;
  readonly lcpP75Ms: number;
  readonly ttfbP75Ms: number;
  /** Phase 2.3 访问分析落地前，本字段恒为 0 */
  readonly bounceRate: number;
}

export interface PerformanceOverviewDto {
  readonly vitals: readonly VitalMetricDto[];
  readonly stages: readonly LoadStageDto[];
  readonly trend: readonly TrendBucketDto[];
  readonly slowPages: readonly SlowPageDto[];
}
