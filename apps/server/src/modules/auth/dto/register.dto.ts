import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email("邮箱格式无效"),
  password: z.string().min(8, "密码至少 8 位").max(128),
  displayName: z.string().min(1).max(64).optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
