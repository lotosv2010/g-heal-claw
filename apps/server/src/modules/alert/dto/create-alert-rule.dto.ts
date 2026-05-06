import { z } from "zod";

/**
 * 创建告警规则的请求体 Schema
 * condition: 触发条件对象（如 { metric: "error_count", operator: "gt", threshold: 100, window: "5m" }）
 * filter: 可选过滤条件（如 { tags: [...], url_pattern: "..." }）
 */
export const CreateAlertRuleSchema = z.object({
  name: z.string().min(1).max(128),
  target: z.string().min(1).max(256),
  condition: z.record(z.string(), z.unknown()),
  filter: z.record(z.string(), z.unknown()).optional(),
  severity: z.enum(["critical", "warning", "info"]).default("warning"),
  cooldownMs: z.number().int().min(0).default(300_000),
  channels: z.array(z.string()).optional(),
});

export type CreateAlertRuleInput = z.infer<typeof CreateAlertRuleSchema>;
