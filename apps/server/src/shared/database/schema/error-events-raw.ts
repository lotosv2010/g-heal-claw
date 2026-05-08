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
 * 异常事件原始表
 *
 * 所有 error 事件单表承载，event_id 幂等。
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
    /** 资源子分类（仅 subType=resource 时有意义，对齐 SPEC 9 分类） */
    resourceKind: varchar("resource_kind", { length: 16 }),
    message: text("message").notNull(),
    messageHead: varchar("message_head", { length: 128 }).notNull(),
    stack: text("stack"),
    frames: jsonb("frames"),
    componentStack: text("component_stack"),
    resource: jsonb("resource"),
    breadcrumbs: jsonb("breadcrumbs"),
    /** ajax / api_code 请求结构化字段（展开自 event.request） */
    requestUrl: text("request_url"),
    requestMethod: varchar("request_method", { length: 16 }),
    requestStatus: integer("request_status"),
    requestDurationMs: doublePrecision("request_duration_ms"),
    requestBizCode: varchar("request_biz_code", { length: 64 }),
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
    index("idx_err_project_ts").on(t.projectId, t.tsMs),
    index("idx_err_project_sub_ts").on(t.projectId, t.subType, t.tsMs),
    index("idx_err_project_group_ts").on(
      t.projectId,
      t.subType,
      t.messageHead,
      t.tsMs,
    ),
    /** 资源子分类按小时粒度聚合时使用 */
    index("idx_err_project_kind_ts").on(
      t.projectId,
      t.subType,
      t.resourceKind,
      t.tsMs,
    ),
  ],
);

export type ErrorEventRow = typeof errorEventsRaw.$inferSelect;
export type NewErrorEventRow = typeof errorEventsRaw.$inferInsert;
