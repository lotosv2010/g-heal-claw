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
 * 自定义分级日志原始表
 *
 * 目的：承载 customPlugin `log(level, message, data)` 与 `captureMessage(...)`
 * 上报的 `type='custom_log'` 事件，供 Dashboard `/dashboard/v1/logs/overview`
 * 聚合 level 分桶 / 趋势 / Top message / 双窗口错误率 delta。
 *
 * 约束：
 *  - `event_id` UNIQUE 保证幂等
 *  - `(project_id, ts_ms)` 窗口扫描
 *  - `(project_id, level, ts_ms)` 支撑 level 分桶
 *  - `(project_id, level, message_head, ts_ms)` 支撑 Top message 聚合
 */
export const customLogsRaw = pgTable(
  "custom_logs_raw",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    eventId: uuid("event_id").notNull().unique(),
    projectId: varchar("project_id", { length: 64 }).notNull(),
    publicKey: varchar("public_key", { length: 64 }).notNull(),
    sessionId: varchar("session_id", { length: 64 }).notNull(),
    tsMs: bigint("ts_ms", { mode: "number" }).notNull(),
    /** 3 值：info / warn / error */
    level: varchar("level", { length: 8 }).notNull(),
    /** 完整消息文本 */
    message: text("message").notNull(),
    /** 前 128 字的消息头（聚合 / Top 用） */
    messageHead: varchar("message_head", { length: 128 }).notNull(),
    /** 可选结构化数据（超 8KB 已在 SDK 截断） */
    data: jsonb("data"),
    /** 用户自定义标签 */
    tags: jsonb("tags"),
    /** 用户自定义上下文 */
    context: jsonb("context"),
    /** 用户 ID（SDK setUser） */
    userId: varchar("user_id", { length: 64 }),
    /** 页面上下文 */
    pageUrl: text("page_url").notNull(),
    pagePath: text("page_path").notNull(),
    /** 页面标题 */
    pageTitle: text("page_title"),
    ua: text("ua"),
    browser: varchar("browser", { length: 64 }),
    os: varchar("os", { length: 64 }),
    deviceType: varchar("device_type", { length: 16 }),
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
    release: varchar("release", { length: 64 }),
    environment: varchar("environment", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_custom_log_project_ts").on(t.projectId, t.tsMs),
    index("idx_custom_log_project_level_ts").on(t.projectId, t.level, t.tsMs),
    index("idx_custom_log_project_level_head_ts").on(
      t.projectId,
      t.level,
      t.messageHead,
      t.tsMs,
    ),
  ],
);

export type CustomLogRow = typeof customLogsRaw.$inferSelect;
export type NewCustomLogRow = typeof customLogsRaw.$inferInsert;
