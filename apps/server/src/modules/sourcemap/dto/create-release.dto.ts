import { z } from "zod";

export const CreateReleaseSchema = z.object({
  version: z.string().min(1, "version 必填").max(64),
  commitSha: z.string().max(40).optional(),
  notes: z.string().max(4096).optional(),
});

export type CreateReleaseDto = z.infer<typeof CreateReleaseSchema>;

export const CreateReleaseResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    projectId: z.string(),
    version: z.string(),
    commitSha: z.string().nullable(),
    createdAt: z.string(),
  }),
});

export type CreateReleaseResponse = z.infer<typeof CreateReleaseResponseSchema>;
