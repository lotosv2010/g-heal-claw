import {
  bigint,
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * 埋点事件原始表（SPEC §3.3.7 / P0-3）
 *
 * 目的：承载 trackPlugin（type='track'）采集的代码 / 点击 / 曝光 / 表单埋点明细，
 * 供 Dashboard `/dashboard/v1/tracking/overview` 聚合 PV / UV / Top 事件 / 趋势。
 *
 * 约束：
 *  - `event_id` UNIQUE 保证幂等（SDK 重试不重复入库）
 *  - `(project_id, ts_ms)` 复合索引，24h/7d/30d 窗口扫描
 *  - `(project_id, track_type, ts_ms)` 按类型聚合
 *  - `(project_id, event_name, ts_ms)` 按事件名 Top N
 *
 * 字段对齐：
 *  - trackType: code / click / expose / submit
 *  - eventName: code 埋点为 track(name) 的 name；其余为 target.selector 或 tag 的规范化值
 */
export const trackEventsRaw = pgTable(
  "track_events_raw",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    eventId: uuid("event_id").notNull().unique(),
    projectId: varchar("project_id", { length: 64 }).notNull(),
    publicKey: varchar("public_key", { length: 64 }).notNull(),
    sessionId: varchar("session_id", { length: 64 }).notNull(),
    tsMs: bigint("ts_ms", { mode: "number" }).notNull(),
    /** 埋点类别：code / click / expose / submit */
    trackType: varchar("track_type", { length: 16 }).notNull(),
    /** 事件名：code 埋点取 properties.__name；自动埋点取 selector / tag */
    eventName: varchar("event_name", { length: 128 }).notNull(),
    /** 目标元素标签（button / a / input / ...） */
    targetTag: varchar("target_tag", { length: 32 }),
    /** 目标元素 id */
    targetId: varchar("target_id", { length: 128 }),
    /** 目标元素 class */
    targetClass: text("target_class"),
    /** CSS selector 或 data-track-id */
    targetSelector: text("target_selector"),
    /** 元素文本（截断 200） */
    targetText: text("target_text"),
    /** 自定义属性（code 埋点透传 + data-track-* 解析） */
    properties: jsonb("properties"),
    /** 用户 id（可选） */
    userId: varchar("user_id", { length: 64 }),
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
    index("idx_track_project_ts").on(t.projectId, t.tsMs),
    index("idx_track_project_type_ts").on(t.projectId, t.trackType, t.tsMs),
    index("idx_track_project_name_ts").on(t.projectId, t.eventName, t.tsMs),
    index("idx_track_project_path_ts").on(t.projectId, t.pagePath, t.tsMs),
    index("idx_track_project_session_ts").on(t.projectId, t.sessionId, t.tsMs),
  ],
);

export type TrackEventRow = typeof trackEventsRaw.$inferSelect;
export type NewTrackEventRow = typeof trackEventsRaw.$inferInsert;
