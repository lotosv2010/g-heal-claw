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
 * 异常事件原始表（ADR-0016 §2）
 *
 * MVP：所有 error 事件单表承载，event_id 幂等；不做指纹聚合。
 * `message_head` 为 `message.slice(0, 128)`，UI 分组键之一（配合 sub_type）。
 *
 * 迁移备注：project_id 暂不加 FK；T1.4.1 完整 Processor 落地时迁入 events_raw
 * 分区 + issues UPSERT，本表降级为查询副本或废弃（届时新写 ADR）。
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
