import {
  bigint,
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * 静态资源明细原始表（ADR-0022 §2）
 *
 * 目的：承载 resourcePlugin（type='resource'）通过 `PerformanceObserver('resource')`
 * 采集的全量静态资源加载明细，供 Dashboard `/dashboard/v1/resources/overview` 聚合
 * 吞吐 / 失败率 / 慢占比 / p75 / 分类分布 / Top 慢资源 / Top 失败 host。
 *
 * 与 api_events_raw 分工：
 *  - api_events_raw：fetch/XHR 业务请求
 *  - resource_events_raw：script/stylesheet/image/font/media/other（排除 fetch/xhr/beacon）
 *
 * 约束：
 *  - `event_id` UNIQUE 保证幂等
 *  - `(project_id, ts_ms)` 复合索引支撑窗口扫描
 *  - `(project_id, category, ts_ms)` / `(project_id, host, ts_ms)` 支撑分类 / CDN 维度
 *  - `(project_id, failed, ts_ms)` / `(project_id, slow, ts_ms)` 失败率 / 慢资源 Top 热路径
 */
export const resourceEventsRaw = pgTable(
  "resource_events_raw",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    eventId: uuid("event_id").notNull().unique(),
    projectId: varchar("project_id", { length: 64 }).notNull(),
    publicKey: varchar("public_key", { length: 64 }).notNull(),
    sessionId: varchar("session_id", { length: 64 }).notNull(),
    tsMs: bigint("ts_ms", { mode: "number" }).notNull(),
    /** 6 类分类：script / stylesheet / image / font / media / other */
    category: varchar("category", { length: 16 }).notNull(),
    /** 原始 RT initiatorType（调试 / 溯源） */
    initiatorType: varchar("initiator_type", { length: 32 }).notNull(),
    /** URL 派生的 host（CDN 聚合） */
    host: varchar("host", { length: 128 }).notNull(),
    /** 完整资源 URL */
    url: text("url").notNull(),
    /** 加载耗时（毫秒） */
    durationMs: doublePrecision("duration_ms").notNull(),
    transferSize: integer("transfer_size"),
    encodedSize: integer("encoded_size"),
    decodedSize: integer("decoded_size"),
    protocol: varchar("protocol", { length: 32 }),
    /** hit / miss / unknown */
    cache: varchar("cache", { length: 16 }).notNull().default("unknown"),
    slow: boolean("slow").notNull().default(false),
    failed: boolean("failed").notNull().default(false),
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
    index("idx_res_project_ts").on(t.projectId, t.tsMs),
    index("idx_res_project_category_ts").on(t.projectId, t.category, t.tsMs),
    index("idx_res_project_host_ts").on(t.projectId, t.host, t.tsMs),
    index("idx_res_project_failed_ts").on(t.projectId, t.failed, t.tsMs),
    index("idx_res_project_slow_ts").on(t.projectId, t.slow, t.tsMs),
  ],
);

export type ResourceEventRow = typeof resourceEventsRaw.$inferSelect;
export type NewResourceEventRow = typeof resourceEventsRaw.$inferInsert;
