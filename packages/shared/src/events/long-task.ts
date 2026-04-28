import { z } from "zod";
import { BaseEventSchema } from "./base.js";

/**
 * 长任务 / 卡顿 / 无响应（SPEC §3.3.2）
 *
 * 三级分类（ADR-0018）：
 *  - `long_task`   50 ms ≤ duration < 2000 ms —— 浏览器原生 long task
 *  - `jank`        2000 ms ≤ duration < 5000 ms —— 卡顿（用户可感知）
 *  - `unresponsive` duration ≥ 5000 ms —— 无响应（页面假死）
 *
 * SDK 侧按 duration 计算 tier 后上报；旧版 SDK 未填 tier 的事件，服务端按 duration 回填。
 */
export const LongTaskTierSchema = z.enum(["long_task", "jank", "unresponsive"]);
export type LongTaskTier = z.infer<typeof LongTaskTierSchema>;

/** SDK/服务端共享：按 duration 推导 tier 的判定阈值（ms） */
export const LONG_TASK_TIER_THRESHOLDS = {
  jankMinMs: 2000,
  unresponsiveMinMs: 5000,
} as const;

/** 纯函数：duration → tier（SDK 与服务端双端共用，避免分级口径分叉） */
export function classifyLongTaskTier(durationMs: number): LongTaskTier {
  if (durationMs >= LONG_TASK_TIER_THRESHOLDS.unresponsiveMinMs) return "unresponsive";
  if (durationMs >= LONG_TASK_TIER_THRESHOLDS.jankMinMs) return "jank";
  return "long_task";
}

export const LongTaskEventSchema = BaseEventSchema.extend({
  type: z.literal("long_task"),
  duration: z.number().positive(),
  startTime: z.number().nonnegative(),
  /** 三级分类（可选以兼容历史事件；服务端在缺失时按 duration 回填） */
  tier: LongTaskTierSchema.optional(),
  attribution: z
    .array(
      z.object({
        name: z.string(),
        entryType: z.string(),
        startTime: z.number().nonnegative(),
        duration: z.number().nonnegative(),
      }),
    )
    .optional(),
});
export type LongTaskEvent = z.infer<typeof LongTaskEventSchema>;
