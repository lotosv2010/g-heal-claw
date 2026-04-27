import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.js";

/**
 * Release 发布版本（ADR-0017 §3.6）
 *
 * version：用户可见版本号（1.0.0 / 2026.04.27）
 * commit_sha：可选，用于 Sourcemap 关联（T1.5）
 * (project_id, version) 唯一保证不重复发布
 */
export const releases = pgTable(
  "releases",
  {
    id: varchar("id", { length: 32 }).primaryKey(), // rel_xxx
    projectId: varchar("project_id", { length: 32 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: varchar("version", { length: 64 }).notNull(),
    commitSha: varchar("commit_sha", { length: 40 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_releases_project_version").on(t.projectId, t.version),
    index("idx_releases_project_created").on(t.projectId, t.createdAt),
  ],
);

export type ReleaseRow = typeof releases.$inferSelect;
export type NewReleaseRow = typeof releases.$inferInsert;
