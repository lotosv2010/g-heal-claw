import { z } from "zod";
import { BaseEventSchema } from "./base.js";

/**
 * 自定义耗时指标（SPEC §3.3.6）：GHealClaw.time(name, durationMs, properties)
 */
export const CustomMetricSchema = BaseEventSchema.extend({
  type: z.literal("custom_metric"),
  name: z.string().min(1),
  duration: z.number().nonnegative(),
  properties: z.record(z.string(), z.unknown()).optional(),
});
export type CustomMetric = z.infer<typeof CustomMetricSchema>;
