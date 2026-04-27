import { z } from "zod";
import { BaseEventSchema } from "./base.js";

/**
 * 静态资源加载事件（SPEC §3.3.4 / §4.2）
 */
export const ResourceEventSchema = BaseEventSchema.extend({
  type: z.literal("resource"),
  initiatorType: z.string(),
  url: z.string(),
  duration: z.number().nonnegative(),
  transferSize: z.number().int().nonnegative().optional(),
  encodedSize: z.number().int().nonnegative().optional(),
  decodedSize: z.number().int().nonnegative().optional(),
  protocol: z.string().optional(),
  cache: z.enum(["hit", "miss", "unknown"]).default("unknown"),
});
export type ResourceEvent = z.infer<typeof ResourceEventSchema>;
