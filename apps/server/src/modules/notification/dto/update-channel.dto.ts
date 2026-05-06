import { z } from "zod";

/**
 * 更新通知渠道的请求体 Schema
 *
 * 所有字段可选，仅更新传入的字段
 */
export const UpdateChannelSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  type: z.string().min(1).max(64).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateChannelInput = z.infer<typeof UpdateChannelSchema>;
