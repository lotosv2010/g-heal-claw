import { z } from "zod";
import { BaseEventSchema } from "./base.js";

/**
 * 长任务 / 卡顿 / 无响应（SPEC §3.3.2）
 *
 * 后端按阈值分级：≥50ms 记录长任务；2-5s 卡顿；≥5s 无响应。
 */
export const LongTaskEventSchema = BaseEventSchema.extend({
  type: z.literal("long_task"),
  duration: z.number().positive(),
  startTime: z.number().nonnegative(),
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
