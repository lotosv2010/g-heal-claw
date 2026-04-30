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
 * 自定义业务事件原始表（ADR-0023 §3）
 *
 * 目的：承载 customPlugin `track(name, properties)` 上报的 `type='custom_event'`
 * 全量业务埋点，供 Dashboard `/dashboard/v1/custom/overview` 聚合
 * 事件总量 / 去重事件名数 / Top 事件 / Top 页面 / 分时趋势。
 *
 * 与 track_events_raw 的分工：
 *  - track_events_raw：trackPlugin 被动 DOM 采集（click / submit / expose / code）
 *  - custom_events_raw：customPlugin 主动业务 API `GHealClaw.track(...)`
 *
 * 约束：
 *  - `event_id` UNIQUE 保证幂等
 *  - `(project_id, ts_ms)` 复合索引支撑窗口扫描
 *  - `(project_id, name, ts_ms)` 支撑 Top 事件名聚合
 */
export const customEventsRaw = pgTable(
  "custom_events_raw",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    eventId: uuid("event_id").notNull().unique(),
    projectId: varchar("project_id", { length: 64 }).notNull(),
    publicKey: varchar("public_key", { length: 64 }).notNull(),
    sessionId: varchar("session_id", { length: 64 }).notNull(),
    tsMs: bigint("ts_ms", { mode: "number" }).notNull(),
    /** 事件名（业务命名，建议 <domain>_<action>） */
    name: varchar("name", { length: 128 }).notNull(),
    /** 扁平属性（业务自定义 key-value） */
    properties: jsonb("properties").notNull().default({}),
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
    index("idx_custom_event_project_ts").on(t.projectId, t.tsMs),
    index("idx_custom_event_project_name_ts").on(t.projectId, t.name, t.tsMs),
    index("idx_custom_event_project_path_ts").on(t.projectId, t.pagePath, t.tsMs),
  ],
);

export type CustomEventRow = typeof customEventsRaw.$inferSelect;
export type NewCustomEventRow = typeof customEventsRaw.$inferInsert;
