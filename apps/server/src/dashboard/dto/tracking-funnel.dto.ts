import { z } from "zod";

/**
 * Dashboard 转化漏斗契约（ADR-0027 / tracking/funnel 切片）
 *
 * 数据源：`track_events_raw` 动态 N 步 CTE 聚合（TrackingService.aggregateFunnel）
 * URL 驱动：`steps` CSV 透传；零持久化、零 RBAC 依赖。
 *
 * Query 由 ZodValidationPipe 校验 → Service 调 aggregateFunnel → 装配层计算：
 *  - totalEntered = step1.users
 *  - conversionFromPrev = step_i.users / step_{i-1}.users
 *  - conversionFromFirst = step_i.users / step_1.users
 *  - overallConversion = step_N.users / step_1.users
 * 所有比例 0~1 浮点，保留 4 位小数；分母为 0 时返回 0（防除零）。
 */

/** 单步 event name 长度范围（与 TrackEvent schema 对齐） */
const EVENT_NAME_MIN = 1;
const EVENT_NAME_MAX = 128;
/** 漏斗最小 / 最大步数（与 TrackingService FUNNEL_MIN/MAX_STEPS 对齐） */
const STEPS_MIN = 2;
const STEPS_MAX = 8;

// ------- 请求 query -------

export const FunnelOverviewQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  /** 聚合窗口（小时），默认 24，最大 168（7d） */
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
  environment: z.string().optional(),
  /**
   * 步骤事件名 CSV：`steps=view_home,click_cta,submit_form`
   * 解析规则：split(',') → trim → 过滤空串；再校验 2~8 项，每项长度 1~128
   */
  steps: z
    .string()
    .min(1, "steps 必填")
    .transform((raw) =>
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    )
    .pipe(
      z
        .array(z.string().min(EVENT_NAME_MIN).max(EVENT_NAME_MAX))
        .min(STEPS_MIN, `steps 至少 ${STEPS_MIN} 项`)
        .max(STEPS_MAX, `steps 最多 ${STEPS_MAX} 项`),
    ),
  /** 步骤间最大间隔（分钟），默认 60，最大 24h */
  stepWindowMinutes: z.coerce.number().int().min(1).max(24 * 60).default(60),
});
export type FunnelOverviewQuery = z.infer<typeof FunnelOverviewQuerySchema>;

// ------- 响应 DTO -------

export interface FunnelStepDto {
  readonly index: number;
  readonly eventName: string;
  readonly users: number;
  /** 本步 / 上一步（step 1 恒为 1.0；保留 4 位小数） */
  readonly conversionFromPrev: number;
  /** 本步 / 首步（step 1 恒为 1.0；保留 4 位小数） */
  readonly conversionFromFirst: number;
}

export interface FunnelOverviewDto {
  readonly windowHours: number;
  readonly stepWindowMinutes: number;
  readonly totalEntered: number;
  readonly steps: readonly FunnelStepDto[];
  /** 末步 / 首步（保留 4 位小数） */
  readonly overallConversion: number;
}
