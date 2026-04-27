import { z } from "zod";
import { BaseEventSchema, BreadcrumbSchema } from "./base.js";

/**
 * 自定义分级日志（SPEC §3.3.6）：GHealClaw.log(level, msg, data)
 */
export const CustomLogSchema = BaseEventSchema.extend({
  type: z.literal("custom_log"),
  level: z.enum(["info", "warn", "error"]),
  message: z.string(),
  data: z.unknown().optional(),
  breadcrumbs: z.array(BreadcrumbSchema).max(100).optional(),
});
export type CustomLog = z.infer<typeof CustomLogSchema>;
