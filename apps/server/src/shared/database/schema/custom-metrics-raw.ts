import {
  bigint,
  bigserial,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * 自定义业务测速原始表（ADR-0023 §3）
 *
 * 目的：承载 customPlugin `time(name, durationMs, properties)` 上报的 `type='custom_metric'`
 * 业务自定义耗时样本，供 Dashboard `/dashboard/v1/custom/overview` metrics 侧聚合
 * 样本总量 / 去重 metric 名 / 全站 p75/p95 / Top metric（按 p75 倒序）。
 *
 * 约束：
 *  - `event_id` UNIQUE 保证幂等
 *  - `(project_id, ts_ms)` 支撑窗口扫描
 *  - `(project_id, name, ts_ms)` 支撑按 metric 名分组 p50/p75/p95
 */
export const customMetricsRaw = pgTable(
  "custom_metrics_raw",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    eventId: uuid("event_id").notNull().unique(),
    projectId: varchar("project_id", { length: 64 }).notNull(),
    publicKey: varchar("public_key", { length: 64 }).notNull(),
    sessionId: varchar("session_id", { length: 64 }).notNull(),
    tsMs: bigint("ts_ms", { mode: "number" }).notNull(),
    /** metric 名（业务命名，如 checkout_time / search_latency） */
    name: varchar("name", { length: 128 }).notNull(),
    /** 耗时（毫秒）；非负有限数，上限 24h */
    durationMs: doublePrecision("duration_ms").notNull(),
    /** 扁平属性（可选） */
    properties: jsonb("properties"),
    /** 页面上下文 */
    pageUrl: text("page_url").notNull(),
    pagePath: text("page_path").notNull(),
    ua: text("ua"),
    browser: varchar("browser", { length: 64 }),
    os: varchar("os", { length: 64 }),
    deviceType: varchar("device_type", { length: 16 }),
    release: varchar("release", { length: 64 }),
    environment: varchar("environment", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_custom_metric_project_ts").on(t.projectId, t.tsMs),
    index("idx_custom_metric_project_name_ts").on(t.projectId, t.name, t.tsMs),
  ],
);

export type CustomMetricRow = typeof customMetricsRaw.$inferSelect;
export type NewCustomMetricRow = typeof customMetricsRaw.$inferInsert;
