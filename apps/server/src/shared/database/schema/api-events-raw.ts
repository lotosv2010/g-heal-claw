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
 * API 请求明细原始表（ADR-0020 §4.2）
 *
 * 目的：承载 apiPlugin（type='api'）采集的所有 fetch/XHR 请求的全量明细，
 * 供 Dashboard `/dashboard/v1/api/overview` 聚合吞吐 / 慢请求 Top / 错误率 / 状态码分布。
 *
 * 约束：
 *  - `event_id` UNIQUE 保证幂等
 *  - `(project_id, ts_ms)` 复合索引，24h/7d/30d 窗口扫描优化
 *  - `(project_id, host, ts_ms)` / `(project_id, status, ts_ms)` 支撑维度聚合
 *  - 30d TTL 由后续 pg_cron 脚本清理（本轮手动 prune）
 *
 * 与 error_events_raw 的分工：
 *  - error_events_raw：`httpPlugin` 的 ajax 失败 / api_code 异常（异常链路）
 *  - api_events_raw：`apiPlugin` 的所有请求含成功（监控链路）
 */
export const apiEventsRaw = pgTable(
  "api_events_raw",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    eventId: uuid("event_id").notNull().unique(),
    projectId: varchar("project_id", { length: 64 }).notNull(),
    publicKey: varchar("public_key", { length: 64 }).notNull(),
    sessionId: varchar("session_id", { length: 64 }).notNull(),
    tsMs: bigint("ts_ms", { mode: "number" }).notNull(),
    /** HTTP method（GET / POST / …） */
    method: varchar("method", { length: 16 }).notNull(),
    /** 完整 URL（用于调试 / 透出到 Web Detail 抽屉） */
    requestUrl: text("request_url").notNull(),
    /** host（按 host 聚合 / 外部依赖识别） */
    host: varchar("host", { length: 128 }).notNull(),
    /** 原始 pathname（未归一化模板） */
    path: text("path").notNull(),
    /** pathTemplate 占位：T2.2.4 引入模板化后写入（/api/users/:id），本期等于 path */
    pathTemplate: text("path_template").notNull(),
    /** HTTP 响应状态码，0 表示网络层失败 */
    status: integer("status").notNull(),
    /** 请求耗时（毫秒） */
    durationMs: doublePrecision("duration_ms").notNull(),
    /** 请求体估算字节数（仅 string / ArrayBuffer / Blob） */
    requestSize: integer("request_size"),
    /** 响应体字节数（优先读 Content-Length） */
    responseSize: integer("response_size"),
    slow: boolean("slow").notNull().default(false),
    failed: boolean("failed").notNull().default(false),
    errorMessage: text("error_message"),
    traceId: varchar("trace_id", { length: 64 }),
    // T2.2.2：请求/响应体截断（≤4KB）
    requestBody: text("request_body"),
    responseBody: text("response_body"),
    breadcrumbs: jsonb("breadcrumbs"),
    /** 页面上下文 */
    pageUrl: text("page_url").notNull(),
    pagePath: text("page_path").notNull(),
    ua: text("ua"),
    browser: varchar("browser", { length: 64 }),
    browserVersion: varchar("browser_version", { length: 32 }),
    os: varchar("os", { length: 64 }),
    osVersion: varchar("os_version", { length: 32 }),
    deviceType: varchar("device_type", { length: 16 }),
    networkType: varchar("network_type", { length: 16 }),
    country: varchar("country", { length: 64 }),
    region: varchar("region", { length: 64 }),
    release: varchar("release", { length: 64 }),
    environment: varchar("environment", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_api_project_ts").on(t.projectId, t.tsMs),
    index("idx_api_project_host_ts").on(t.projectId, t.host, t.tsMs),
    index("idx_api_project_status_ts").on(t.projectId, t.status, t.tsMs),
    index("idx_api_project_path_ts").on(t.projectId, t.pathTemplate, t.tsMs),
    /** 慢请求 Top / 失败率 聚合热路径 */
    index("idx_api_project_failed_ts").on(t.projectId, t.failed, t.tsMs),
  ],
);

export type ApiEventRow = typeof apiEventsRaw.$inferSelect;
export type NewApiEventRow = typeof apiEventsRaw.$inferInsert;
