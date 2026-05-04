import { z } from "zod";

/**
 * 数据总览 DTO（ADR-0029）
 *
 * 契约特点：
 *  - 5 域（errors / performance / api / resources / visits），每域独立 `source` 便于局部降级
 *  - health 权重：errors 40% + LCP 25% + API 错误率 20% + 资源失败率 15%
 *  - 三态 tone：good / warn / destructive / unknown（全空样本时为 unknown）
 */

/** 数据源状态（装配层三态，与其他 /overview 契约一致） */
export const SourceStateSchema = z.enum(["live", "empty", "error"]);
export type SourceState = z.infer<typeof SourceStateSchema>;

/** 总体健康度色阶 */
export const HealthToneSchema = z.enum([
  "good",
  "warn",
  "destructive",
  "unknown",
]);
export type HealthTone = z.infer<typeof HealthToneSchema>;

/** 延迟环比方向（与 monitor 领域约定一致） */
export const DeltaDirectionSchema = z.enum(["up", "down", "flat"]);
export type DeltaDirection = z.infer<typeof DeltaDirectionSchema>;

// ---------------- 查询入参 ----------------

export const OverviewSummaryQuerySchema = z.object({
  projectId: z.string().min(1),
  /** 时间窗口（小时），默认 24h，范围 [1, 168] */
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
});
export type OverviewSummaryQuery = z.infer<typeof OverviewSummaryQuerySchema>;

// ---------------- Health ----------------

/** 单项健康度分量（便于前端 tooltip 展开扣分明细） */
export const HealthComponentSchema = z.object({
  key: z.enum([
    "errors",
    "performance",
    "api",
    "resources",
  ]),
  /** 该分量扣分值（0~weight，浮点） */
  deducted: z.number().nonnegative(),
  /** 该分量归一后权重（当有域空样本时会被重新分配） */
  weight: z.number().nonnegative(),
  /** 该分量原始 signal（错误率 / 失败率 / LCP p75…），便于前端调试 */
  signal: z.number(),
});
export type HealthComponent = z.infer<typeof HealthComponentSchema>;

export const HealthDtoSchema = z.object({
  score: z.number().nullable(),
  tone: HealthToneSchema,
  components: z.array(HealthComponentSchema),
});
export type HealthDto = z.infer<typeof HealthDtoSchema>;

// ---------------- 5 域 Summary ----------------

export const ErrorsSummaryDtoSchema = z.object({
  totalEvents: z.number().int().nonnegative(),
  impactedSessions: z.number().int().nonnegative(),
  deltaPercent: z.number().nonnegative(),
  deltaDirection: DeltaDirectionSchema,
  source: SourceStateSchema,
});
export type ErrorsSummaryDto = z.infer<typeof ErrorsSummaryDtoSchema>;

export const PerformanceSummaryDtoSchema = z.object({
  lcpP75Ms: z.number().nonnegative(),
  inpP75Ms: z.number().nonnegative(),
  clsP75: z.number().nonnegative(),
  tone: z.enum(["good", "warn", "destructive", "unknown"]),
  source: SourceStateSchema,
});
export type PerformanceSummaryDto = z.infer<typeof PerformanceSummaryDtoSchema>;

export const ApiSummaryDtoSchema = z.object({
  totalRequests: z.number().int().nonnegative(),
  errorRate: z.number().min(0).max(1),
  p75DurationMs: z.number().nonnegative(),
  source: SourceStateSchema,
});
export type ApiSummaryDto = z.infer<typeof ApiSummaryDtoSchema>;

export const ResourcesSummaryDtoSchema = z.object({
  totalRequests: z.number().int().nonnegative(),
  failureRate: z.number().min(0).max(1),
  slowCount: z.number().int().nonnegative(),
  source: SourceStateSchema,
});
export type ResourcesSummaryDto = z.infer<typeof ResourcesSummaryDtoSchema>;

export const VisitsSummaryDtoSchema = z.object({
  pv: z.number().int().nonnegative(),
  uv: z.number().int().nonnegative(),
  spaRatio: z.number().min(0).max(1),
  source: SourceStateSchema,
});
export type VisitsSummaryDto = z.infer<typeof VisitsSummaryDtoSchema>;

// ---------------- 根响应 ----------------

export const OverviewSummaryDtoSchema = z.object({
  health: HealthDtoSchema,
  errors: ErrorsSummaryDtoSchema,
  performance: PerformanceSummaryDtoSchema,
  api: ApiSummaryDtoSchema,
  resources: ResourcesSummaryDtoSchema,
  visits: VisitsSummaryDtoSchema,
  /** 生成时间戳（ms），供前端做时效展示 */
  generatedAtMs: z.number().int().nonnegative(),
  /** 总览窗口（小时），回显 */
  windowHours: z.number().int().min(1).max(168),
});
export type OverviewSummaryDto = z.infer<typeof OverviewSummaryDtoSchema>;
