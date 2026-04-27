import { z } from "zod";
import { BaseEventSchema } from "./base.js";

/**
 * 页面停留时长（SPEC §3.3.7）
 *
 * 通过 `visibilitychange` 累计可见时长，不含后台时间。
 */
export const PageDurationEventSchema = BaseEventSchema.extend({
  type: z.literal("page_duration"),
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  activeMs: z.number().nonnegative(),
});
export type PageDurationEvent = z.infer<typeof PageDurationEventSchema>;
