import { z } from "zod";

/**
 * 创建通知渠道的请求体 Schema
 *
 * type 支持：webhook / email / dingtalk / feishu / slack / wechat_work 等
 * config 按 type 不同有不同结构（如 webhook 包含 url，email 包含 recipients 等）
 */
export const CreateChannelSchema = z.object({
  name: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  config: z.record(z.string(), z.unknown()),
});

export type CreateChannelInput = z.infer<typeof CreateChannelSchema>;
