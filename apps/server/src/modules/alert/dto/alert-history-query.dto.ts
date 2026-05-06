import { z } from "zod";

/**
 * 告警历史查询参数 Schema
 */
export const AlertHistoryQuerySchema = z.object({
  projectId: z.string().min(1),
  ruleId: z.string().optional(),
  status: z.enum(["firing", "resolved"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AlertHistoryQuery = z.infer<typeof AlertHistoryQuerySchema>;
