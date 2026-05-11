import { z } from "zod";

export const TriggerHealSchema = z.object({
  repoUrl: z.string().url(),
  branch: z.string().min(1).default("main"),
  basePath: z.string().default(""),
  requireApproval: z.boolean().default(false),
});

export type TriggerHealDto = z.infer<typeof TriggerHealSchema>;

export const HealJobQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(["queued", "cloning", "diagnosing", "awaiting_approval", "patching", "verifying", "pr_created", "failed"])
    .optional(),
});

export type HealJobQueryDto = z.infer<typeof HealJobQuerySchema>;
