import { z } from "zod";

export const UpdateMemberSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});

export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
