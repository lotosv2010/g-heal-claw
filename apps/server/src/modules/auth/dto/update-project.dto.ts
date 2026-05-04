import { z } from "zod";

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "slug 只能包含小写字母、数字和连字符")
    .optional(),
  platform: z.enum(["web", "miniapp", "mobile"]).optional(),
  retentionDays: z.number().int().min(1).max(365).optional(),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
