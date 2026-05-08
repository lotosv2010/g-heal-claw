import { pgTable, varchar, timestamp, index } from "drizzle-orm/pg-core";

/** AI 对话会话表 */
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    projectId: varchar("project_id", { length: 32 }).notNull(),
    userId: varchar("user_id", { length: 32 }).notNull(),
    title: varchar("title", { length: 256 }).notNull().default("新对话"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ai_conv_user").on(table.userId, table.updatedAt),
    index("idx_ai_conv_project").on(table.projectId, table.updatedAt),
  ],
);
