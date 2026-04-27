import {
  bigint,
  index,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * 通用事件归档父表（ADR-0017 §3.8）
 *
 * **本期定位**：仅建父表 + 4 张周分区 + 索引骨架；Gateway 不写入。
 * 当 T1.4.1 完整 Processor 落地时，Gateway 切换为统一 events_raw.INSERT，
 * 切片表（perf / error）降级为特化索引或物化视图。
 *
 * **分区**：`PARTITION BY RANGE (ingested_at)`，Drizzle ORM 不支持原生分区 DSL，
 * 分区语法（父表 `PARTITION BY` + 子分区 `PARTITION OF ... FOR VALUES`）在
 * `ddl.ts` 中以裸 SQL 追加；drizzle-kit generate 产出的迁移文件同样需手工补齐。
 *
 * **主键**：分区键（ingested_at）必须参与主键，故 PK 为 (id, ingested_at)
 * 而非单列 id；Drizzle 这里用 composite primary key 体现。
 */
export const eventsRaw = pgTable(
  "events_raw",
  {
    id: bigint("id", { mode: "bigint" }).notNull(),
    eventId: uuid("event_id").notNull(),
    projectId: varchar("project_id", { length: 32 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    payload: jsonb("payload").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.ingestedAt] }),
    index("idx_events_raw_project_type_ingested").on(
      t.projectId,
      t.type,
      t.ingestedAt,
    ),
    index("idx_events_raw_event_id").on(t.eventId),
  ],
);

export type EventRawRow = typeof eventsRaw.$inferSelect;
export type NewEventRawRow = typeof eventsRaw.$inferInsert;
