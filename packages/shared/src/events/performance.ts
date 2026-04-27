import { z } from "zod";
import { BaseEventSchema, NavigationTimingSchema } from "./base.js";

/**
 * 性能事件（SPEC §4.2）
 *
 * FSP = 首屏时间（First Screen Paint，自定义实现，非 W3C 标准名）
 */
export const PerformanceEventSchema = BaseEventSchema.extend({
  type: z.literal("performance"),
  metric: z.enum(["LCP", "FCP", "CLS", "INP", "TTFB", "FSP"]),
  value: z.number().nonnegative(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  navigation: NavigationTimingSchema.optional(),
});
export type PerformanceEvent = z.infer<typeof PerformanceEventSchema>;
