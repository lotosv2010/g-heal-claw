import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.js";

/**
 * 通知渠道表（ADR-0035 §2）
 */
export const channels = pgTable(
  "channels",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    projectId: varchar("project_id", { length: 32 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    type: varchar("type", { length: 16 }).notNull(),
    config: jsonb("config").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_channels_project").on(t.projectId),
  ],
);
