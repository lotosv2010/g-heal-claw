import {
  boolean,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { alertRules } from "./alert-rules.js";

/**
 * 告警历史表（ADR-0035 §2）
 */
export const alertHistory = pgTable(
  "alert_history",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    ruleId: varchar("rule_id", { length: 32 })
      .notNull()
      .references(() => alertRules.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("firing"),
    metricValue: doublePrecision("metric_value"),
    threshold: doublePrecision("threshold"),
    firedAt: timestamp("fired_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    notified: boolean("notified").notNull().default(false),
  },
  (t) => [
    index("idx_alert_history_rule").on(t.ruleId),
    index("idx_alert_history_project_status").on(t.projectId, t.status),
  ],
);
