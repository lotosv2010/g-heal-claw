import { z } from "zod";

export const HealJobStatus = {
  Queued: "queued",
  Diagnosing: "diagnosing",
  Patching: "patching",
  Verifying: "verifying",
  PrCreated: "pr_created",
  Failed: "failed",
} as const;

export type HealJobStatus =
  (typeof HealJobStatus)[keyof typeof HealJobStatus];

export const HealJobPayloadSchema = z.object({
  healJobId: z.string(),
  issueId: z.string(),
  projectId: z.string(),
  repoUrl: z.string().url(),
  branch: z.string().default("main"),
  issueTitle: z.string(),
  issueMessage: z.string(),
  stackTrace: z.string().optional(),
  breadcrumbs: z.string().optional(),
  repoConfig: z
    .object({
      maxLoc: z.number().int().positive().default(50),
      paths: z.array(z.string()).default(["src/**"]),
      forbidden: z.array(z.string()).default([]),
      verify: z.array(z.string()).default([]),
      allowNetwork: z.boolean().default(false),
    })
    .optional(),
});

export type HealJobPayload = z.infer<typeof HealJobPayloadSchema>;

export const HealResultPayloadSchema = z.object({
  healJobId: z.string(),
  status: z.enum(["pr_created", "failed"]),
  prUrl: z.string().url().optional(),
  diagnosis: z.string().optional(),
  patch: z.string().optional(),
  errorMessage: z.string().optional(),
  trace: z.array(
    z.object({
      role: z.enum(["thought", "action", "observation"]),
      content: z.string(),
      timestamp: z.number(),
    }),
  ).optional(),
});

export type HealResultPayload = z.infer<typeof HealResultPayloadSchema>;
