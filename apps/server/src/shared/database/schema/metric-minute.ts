import {
  bigserial,
  doublePrecision,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * 分钟级指标预聚合表（ADR-0037）
 *
 * PerformanceProcessor 按 (project_id, metric, minute) 窗口写入百分位统计，
 * ApdexService 写入 metric='apdex' 行。保留 365 天，替代实时 raw 表聚合。
 */
export const metricMinute = pgTable(
  "metric_minute",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    projectId: varchar("project_id", { length: 32 }).notNull(),
    metric: varchar("metric", { length: 16 }).notNull(),
    bucketTs: timestamp("bucket_ts", { withTimezone: true }).notNull(),
    p50: doublePrecision("p50").notNull().default(0),
    p75: doublePrecision("p75").notNull().default(0),
    p90: doublePrecision("p90").notNull().default(0),
    p95: doublePrecision("p95").notNull().default(0),
    p99: doublePrecision("p99").notNull().default(0),
    count: integer("count").notNull().default(0),
    sum: doublePrecision("sum").notNull().default(0),
    // Apdex 专用（仅 metric='apdex' 时填充）
    satisfied: integer("satisfied").notNull().default(0),
    tolerating: integer("tolerating").notNull().default(0),
    frustrated: integer("frustrated").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_mm_project_metric_ts").on(
      t.projectId,
      t.metric,
      t.bucketTs,
    ),
    index("idx_mm_project_metric_ts").on(t.projectId, t.metric, t.bucketTs),
  ],
);

export type MetricMinuteRow = typeof metricMinute.$inferSelect;
export type NewMetricMinuteRow = typeof metricMinute.$inferInsert;
