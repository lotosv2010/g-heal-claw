import { pgTable, varchar, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/** AI 对话消息表 */
export const aiMessages = pgTable(
  "ai_messages",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    conversationId: varchar("conversation_id", { length: 32 }).notNull(),
    role: varchar("role", { length: 16 }).notNull(), // 'user' | 'assistant' | 'system'
    content: text("content").notNull(),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ai_msg_conv").on(table.conversationId, table.createdAt),
  ],
);
