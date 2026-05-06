import { z } from "zod";

/**
 * 更新告警规则的请求体 Schema（所有字段可选）
 */
export const UpdateAlertRuleSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  target: z.string().min(1).max(256).optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
  filter: z.record(z.string(), z.unknown()).nullable().optional(),
  severity: z.enum(["critical", "warning", "info"]).optional(),
  cooldownMs: z.number().int().min(0).optional(),
  channels: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

export type UpdateAlertRuleInput = z.infer<typeof UpdateAlertRuleSchema>;
