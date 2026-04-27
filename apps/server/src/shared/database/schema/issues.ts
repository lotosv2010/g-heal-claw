import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.js";
import { users } from "./users.js";

/**
 * 异常聚合表（ADR-0017 §3.7）
 *
 * 本期状态：**仅建表不写入**。ErrorsService 仍走 error_events_raw.message_head
 * 字面分组（ADR-0016）；T1.4.2 指纹落地后 ErrorProcessor 开始 UPSERT。
 *
 * fingerprint = sha1(subType + normalize(message) + topFrame)
 * (project_id, fingerprint) 唯一保证每个 Issue 仅一行；ON CONFLICT UPSERT。
 */
export const issues = pgTable(
  "issues",
  {
    id: varchar("id", { length: 32 }).primaryKey(), // iss_xxx
    projectId: varchar("project_id", { length: 32 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    subType: varchar("sub_type", { length: 16 }).notNull(),
    title: text("title").notNull(),
    level: varchar("level", { length: 16 }).notNull().default("error"),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    firstSeen: timestamp("first_seen", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true })
      .notNull()
      .defaultNow(),
    eventCount: bigint("event_count", { mode: "number" }).notNull().default(0),
    impactedSessions: bigint("impacted_sessions", { mode: "number" })
      .notNull()
      .default(0),
    assignedUserId: varchar("assigned_user_id", { length: 32 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_issues_project_fingerprint").on(t.projectId, t.fingerprint),
    index("idx_issues_project_status_lastseen").on(
      t.projectId,
      t.status,
      t.lastSeen,
    ),
    index("idx_issues_project_subtype_lastseen").on(
      t.projectId,
      t.subType,
      t.lastSeen,
    ),
  ],
);

export type IssueRow = typeof issues.$inferSelect;
export type NewIssueRow = typeof issues.$inferInsert;
