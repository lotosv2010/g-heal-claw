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
 * 性能事件原始表（ADR-0013）
 *
 * 合并 performance / long_task 两类事件，按 event_id 幂等写入。
 * 字段命名保持 snake_case；`type` 为判别列区分两种子类型。
 *
 * 迁移备注：project_id 暂不加 FK（保持 demo 硬编码 "demo" 可用）；
 * T1.4.1 完整 Processor 落地时迁入 events_raw 分区并补 FK。
 */
export const perfEventsRaw = pgTable(
  "perf_events_raw",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    eventId: uuid("event_id").notNull().unique(),
    projectId: varchar("project_id", { length: 64 }).notNull(),
    publicKey: varchar("public_key", { length: 64 }).notNull(),
    sessionId: varchar("session_id", { length: 64 }).notNull(),
    tsMs: bigint("ts_ms", { mode: "number" }).notNull(),
    type: varchar("type", { length: 16 }).notNull(),
    metric: varchar("metric", { length: 16 }),
    value: doublePrecision("value"),
    rating: varchar("rating", { length: 24 }),
    ltDurationMs: doublePrecision("lt_duration_ms"),
    ltStartMs: doublePrecision("lt_start_ms"),
    navigation: jsonb("navigation"),
    url: text("url").notNull(),
    path: text("path").notNull(),
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
    index("idx_perf_project_ts").on(t.projectId, t.tsMs),
    index("idx_perf_project_metric_ts").on(t.projectId, t.metric, t.tsMs),
    index("idx_perf_project_path_ts").on(t.projectId, t.path, t.tsMs),
  ],
);

export type PerfEventRow = typeof perfEventsRaw.$inferSelect;
export type NewPerfEventRow = typeof perfEventsRaw.$inferInsert;
