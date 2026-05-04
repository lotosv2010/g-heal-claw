import { z } from "zod";

export const InviteMemberSchema = z.object({
  email: z.string().email("邮箱格式无效"),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
