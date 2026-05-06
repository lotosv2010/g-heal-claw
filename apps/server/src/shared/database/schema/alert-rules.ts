import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.js";

/**
 * 告警规则表（ADR-0035 §2）
 */
export const alertRules = pgTable(
  "alert_rules",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    projectId: varchar("project_id", { length: 32 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    target: varchar("target", { length: 32 }).notNull(),
    filter: jsonb("filter").default({}),
    condition: jsonb("condition").notNull(),
    severity: varchar("severity", { length: 16 }).notNull().default("warning"),
    cooldownMs: integer("cooldown_ms").notNull().default(300000),
    channels: text("channels").array().notNull().default([]),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_alert_rules_project").on(t.projectId),
    index("idx_alert_rules_enabled").on(t.projectId, t.enabled),
  ],
);
