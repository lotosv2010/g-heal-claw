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

/**
 * 异常事件原始表（ADR-0016 §2）
 *
 * MVP：所有 error 事件单表承载，event_id 幂等；不做指纹聚合。
 * `message_head` 为 `message.slice(0, 128)`，UI 分组键之一（配合 sub_type）。
 */
export const errorEventsRaw = pgTable(
  "error_events_raw",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    eventId: uuid("event_id").notNull().unique(),
    projectId: varchar("project_id", { length: 64 }).notNull(),
    publicKey: varchar("public_key", { length: 64 }).notNull(),
    sessionId: varchar("session_id", { length: 64 }).notNull(),
    tsMs: bigint("ts_ms", { mode: "number" }).notNull(),
    subType: varchar("sub_type", { length: 16 }).notNull(),
    message: text("message").notNull(),
    messageHead: varchar("message_head", { length: 128 }).notNull(),
    stack: text("stack"),
    frames: jsonb("frames"),
    componentStack: text("component_stack"),
    resource: jsonb("resource"),
    breadcrumbs: jsonb("breadcrumbs"),
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
    index("idx_err_project_ts").on(t.projectId, t.tsMs),
    index("idx_err_project_sub_ts").on(t.projectId, t.subType, t.tsMs),
    index("idx_err_project_group_ts").on(
      t.projectId,
      t.subType,
      t.messageHead,
      t.tsMs,
    ),
  ],
);

export type ErrorEventRow = typeof errorEventsRaw.$inferSelect;
export type NewErrorEventRow = typeof errorEventsRaw.$inferInsert;
