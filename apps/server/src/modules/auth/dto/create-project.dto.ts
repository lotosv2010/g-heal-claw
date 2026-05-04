import { z } from "zod";

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "项目名不能为空").max(128),
  slug: z
    .string()
    .min(2, "slug 至少 2 位")
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "slug 只能包含小写字母、数字和连字符"),
  platform: z.enum(["web", "miniapp", "mobile"]).default("web"),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
