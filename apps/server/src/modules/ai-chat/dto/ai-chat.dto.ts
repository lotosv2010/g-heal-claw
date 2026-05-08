import { z } from "zod";

export const CreateConversationSchema = z.object({
  title: z.string().max(256).optional(),
});
export type CreateConversationDto = z.infer<typeof CreateConversationSchema>;

export const ConversationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ConversationListQueryDto = z.infer<typeof ConversationListQuerySchema>;

export const MessageListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type MessageListQueryDto = z.infer<typeof MessageListQuerySchema>;
