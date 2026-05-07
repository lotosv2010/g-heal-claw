import {
  bigint,
  bigserial,
  boolean,
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
 * 页面访问原始表（ADR-0020 Tier 2.A / SPEC §3.3.5）
 *
 * 目的：承载 pageViewPlugin（type='page_view'）的每一次页面进入事件，
 * 供 Dashboard `/dashboard/v1/visits/overview` 聚合 PV/UV/TopPages/TopReferrers/Trend。
 *
 * 约束：
 *  - `event_id` UNIQUE 保证幂等
 *  - `(project_id, ts_ms)` 复合索引：24h/7d 窗口扫描
 *  - `(project_id, path, ts_ms)` 支撑 TopPages / Trend by path
 *  - `(project_id, session_id, ts_ms)` 支撑 UV 估算（DISTINCT session_id）
 *  - 30d TTL 由后续 pg_cron 脚本清理（本期手动 prune）
 *
 * 与 track_events_raw 的分工：
 *  - track_events_raw：click / submit / expose / code 主动埋点
 *  - page_view_raw：页面进入独立流，聚合 PV/UV 时无需从 track 中过滤
 */
export const pageViewRaw = pgTable(
  "page_view_raw",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    eventId: uuid("event_id").notNull().unique(),
    projectId: varchar("project_id", { length: 64 }).notNull(),
    publicKey: varchar("public_key", { length: 64 }).notNull(),
    sessionId: varchar("session_id", { length: 64 }).notNull(),
    tsMs: bigint("ts_ms", { mode: "number" }).notNull(),
    /** 完整 URL（透出到 Web Detail 抽屉用） */
    url: text("url").notNull(),
    /** 归一化 pathname（TopPages 聚合键） */
    path: text("path").notNull(),
    /** 引荐来源（document.referrer；可空） */
    referrer: text("referrer"),
    /** 归一化 referrer host（TopReferrers 聚合键；可空） */
    referrerHost: varchar("referrer_host", { length: 128 }),
    /** 加载类型：navigate / reload / back_forward / prerender */
    loadType: varchar("load_type", { length: 16 }).notNull(),
    /** 是否 SPA 路由切换 */
    isSpaNav: boolean("is_spa_nav").notNull().default(false),
    /** 停留时长（毫秒，来自 page_duration 事件；本期始终为 NULL） */
    durationMs: doublePrecision("duration_ms"),
    /** 页面标题 */
    pageTitle: text("page_title"),
    /** 用户自定义标签 */
    tags: jsonb("tags"),
    /** 用户自定义上下文 */
    context: jsonb("context"),
    /** 用户 ID（SDK setUser） */
    userId: varchar("user_id", { length: 64 }),
    /** UTM 来源 */
    utmSource: varchar("utm_source", { length: 128 }),
    /** UTM 媒介 */
    utmMedium: varchar("utm_medium", { length: 128 }),
    /** UTM 营销活动 */
    utmCampaign: varchar("utm_campaign", { length: 128 }),
    /** UTM 关键词 */
    utmTerm: varchar("utm_term", { length: 128 }),
    /** UTM 内容标识 */
    utmContent: varchar("utm_content", { length: 128 }),
    /** 搜索引擎来源 */
    searchEngine: varchar("search_engine", { length: 32 }),
    /** 业务渠道 */
    channel: varchar("channel", { length: 64 }),
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
    release: varchar("release", { length: 64 }),
    environment: varchar("environment", { length: 32 }),
    // T2.3.3 GeoIP 地域字段（写入时由服务端根据客户端 IP 解析填充）
    country: varchar("country", { length: 64 }),
    region: varchar("region", { length: 64 }),
    city: varchar("city", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_pv_project_ts").on(t.projectId, t.tsMs),
    index("idx_pv_project_path_ts").on(t.projectId, t.path, t.tsMs),
    index("idx_pv_project_session_ts").on(t.projectId, t.sessionId, t.tsMs),
    index("idx_pv_project_loadtype_ts").on(t.projectId, t.loadType, t.tsMs),
  ],
);

export type PageViewRow = typeof pageViewRaw.$inferSelect;
export type NewPageViewRow = typeof pageViewRaw.$inferInsert;
