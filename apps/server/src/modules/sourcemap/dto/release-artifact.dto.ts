import { z } from "zod";

export const ReleaseArtifactSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mapFilename: z.string(),
  fileSize: z.number(),
  createdAt: z.string(),
});

export type ReleaseArtifactDto = z.infer<typeof ReleaseArtifactSchema>;

export const ListArtifactsResponseSchema = z.object({
  data: z.array(ReleaseArtifactSchema),
});

export type ListArtifactsResponse = z.infer<typeof ListArtifactsResponseSchema>;
