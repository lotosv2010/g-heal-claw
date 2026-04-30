import { z } from "zod";

/**
 * Dashboard 用户留存契约（ADR-0028 / tracking/retention 切片）
 *
 * 数据源：`page_view_raw` 单 CTE 两步聚合（VisitsService.aggregateRetention）
 * URL 驱动：`cohortDays` / `returnDays` / `identity` / `since` / `until` 透传；
 *   零持久化、零 RBAC 依赖。
 *
 * Query 由 ZodValidationPipe 校验 → Service 调 aggregateRetention → 装配层计算：
 *  - retentionByDay[k] = retained(cohort, k) / cohortSize(cohort)，day 0 恒为 1
 *  - averageByDay[k]   = Σ retained(*, k) / Σ cohortSize(*)  （按队列大小加权）
 *  - totalNewUsers     = Σ cohortSize(*)
 * 所有比例 0~1 浮点，保留 4 位小数；分母为 0 返回 0。
 */

const RETENTION_DAYS_MIN = 1;
const RETENTION_DAYS_MAX = 30;

// ------- 请求 query -------

export const RetentionOverviewQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  /** cohort 宽度（天），默认 7 */
  cohortDays: z.coerce
    .number()
    .int()
    .min(RETENTION_DAYS_MIN)
    .max(RETENTION_DAYS_MAX)
    .default(7),
  /** 观察天数（含 day 0），默认 7 */
  returnDays: z.coerce
    .number()
    .int()
    .min(RETENTION_DAYS_MIN)
    .max(RETENTION_DAYS_MAX)
    .default(7),
  /** 身份粒度：session（默认，与 /monitor/visits UV 口径一致） / user（对齐 funnel） */
  identity: z.enum(["session", "user"]).default("session"),
  /**
   * 窗口起点（ISO 8601），可选；
   * 省略时装配层自动取 now - (cohortDays + returnDays) 天
   */
  since: z.string().datetime().optional(),
  /**
   * 窗口终点（ISO 8601），可选；
   * 省略时默认 now
   */
  until: z.string().datetime().optional(),
});
export type RetentionOverviewQuery = z.infer<
  typeof RetentionOverviewQuerySchema
>;

// ------- 响应 DTO -------

export interface RetentionCohortDto {
  /** ISO date "YYYY-MM-DD" */
  readonly cohortDate: string;
  /** day 0 新用户数 */
  readonly cohortSize: number;
  /** 长度 = returnDays + 1；day 0 恒为 1（或 cohortSize=0 时恒为 0） */
  readonly retentionByDay: readonly number[];
}

export interface RetentionOverviewDto {
  /** live / empty / error —— 与 errors/performance/funnel 三态 SourceBadge 契约一致 */
  readonly source: "live" | "empty" | "error";
  readonly identity: "session" | "user";
  readonly cohortDays: number;
  readonly returnDays: number;
  readonly window: {
    readonly sinceMs: number;
    readonly untilMs: number;
  };
  readonly totalNewUsers: number;
  /** 跨 cohort 按 cohortSize 加权平均的 day 0..returnDays 留存率 */
  readonly averageByDay: readonly number[];
  /** 每个 cohort 的详细矩阵（按 cohortDate 升序） */
  readonly cohorts: readonly RetentionCohortDto[];
}
