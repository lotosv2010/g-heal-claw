import { z } from "zod";
import { BaseEventSchema, BreadcrumbSchema } from "./base.js";

/**
 * API 请求事件（SPEC §3.3.3 / §4.2）
 *
 * 异常请求额外记录 requestBody / responseBody，默认前 2KB 截断。
 */
export const ApiEventSchema = BaseEventSchema.extend({
  type: z.literal("api"),
  method: z.string().min(1),
  url: z.string(),
  status: z.number().int().nonnegative(),
  duration: z.number().nonnegative(),
  requestSize: z.number().int().nonnegative().optional(),
  responseSize: z.number().int().nonnegative().optional(),
  traceId: z.string().optional(),
  slow: z.boolean().default(false),
  failed: z.boolean().default(false),
  errorMessage: z.string().optional(),
  requestBody: z.string().optional(),
  responseBody: z.string().optional(),
  breadcrumbs: z.array(BreadcrumbSchema).max(100).optional(),
});
export type ApiEvent = z.infer<typeof ApiEventSchema>;
