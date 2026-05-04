import { z } from "zod";

export const UploadArtifactQuerySchema = z.object({
  filename: z.string().min(1, "filename 必填").max(512),
});

export type UploadArtifactQuery = z.infer<typeof UploadArtifactQuerySchema>;

export const UploadArtifactResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    filename: z.string(),
    mapFilename: z.string(),
    fileSize: z.number(),
    createdAt: z.string(),
  }),
});

export type UploadArtifactResponse = z.infer<
  typeof UploadArtifactResponseSchema
>;
