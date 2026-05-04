import { z } from "zod";

export const CreateTokenSchema = z.object({
  label: z.string().max(64).optional(),
});

export type CreateTokenInput = z.infer<typeof CreateTokenSchema>;
