import { z } from "zod";

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken 不能为空"),
});

export type RefreshInput = z.infer<typeof RefreshSchema>;
