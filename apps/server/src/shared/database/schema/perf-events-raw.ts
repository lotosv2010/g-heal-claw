import {
  bigint,
  bigserial,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * 性能事件原始表
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
    /** long_task 严重级别：long_task / jank / unresponsive */
    ltTier: varchar("lt_tier", { length: 16 }),
    navigation: jsonb("navigation"),
    /** 用户自定义标签 */
    tags: jsonb("tags"),
    /** 用户自定义上下文 */
    context: jsonb("context"),
    /** 用户 ID（SDK setUser） */
    userId: varchar("user_id", { length: 64 }),
    url: text("url").notNull(),
    path: text("path").notNull(),
    /** 页面标题 */
    pageTitle: text("page_title"),
    ua: text("ua"),
    browser: varchar("browser", { length: 64 }),
    browserVersion: varchar("browser_version", { length: 32 }),
    os: varchar("os", { length: 64 }),
    osVersion: varchar("os_version", { length: 32 }),
    deviceType: varchar("device_type", { length: 16 }),
    networkType: varchar("network_type", { length: 16 }),
    /** 屏幕宽度 px */
    screenWidth: integer("screen_width"),
    /** 屏幕高度 px */
    screenHeight: integer("screen_height"),
    /** 设备像素比 */
    screenDpr: doublePrecision("screen_dpr"),
    /** 浏览器语言 */
    language: varchar("language", { length: 16 }),
    /** IANA 时区 */
    timezone: varchar("timezone", { length: 64 }),
    country: varchar("country", { length: 64 }),
    region: varchar("region", { length: 64 }),
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
