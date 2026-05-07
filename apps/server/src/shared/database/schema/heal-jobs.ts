import { index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { projects } from "./projects.js";
import { issues } from "./issues.js";
import { users } from "./users.js";

/**
 * AI 自愈任务表（Phase 5 · ADR-0036）
 *
 * 状态机：queued → diagnosing → patching → verifying → pr_created | failed
 */
export const healJobs = pgTable(
  "heal_jobs",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    projectId: varchar("project_id", { length: 32 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    issueId: varchar("issue_id", { length: 32 })
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    triggeredBy: varchar("triggered_by", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    repoUrl: text("repo_url").notNull(),
    branch: varchar("branch", { length: 128 }).notNull().default("main"),
    diagnosis: text("diagnosis"),
    patch: text("patch"),
    prUrl: text("pr_url"),
    errorMessage: text("error_message"),
    trace: jsonb("trace").$type<
      Array<{ role: string; content: string; timestamp: number }>
    >(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("heal_jobs_project_idx").on(table.projectId),
    index("heal_jobs_issue_idx").on(table.issueId),
    index("heal_jobs_status_idx").on(table.status),
  ],
);
