# `events_raw` 分区维护

> `events_raw` 为 PostgreSQL 按周（ISO Week，周一~周日 UTC）声明式分区的父表。`PartitionMaintenanceService` 自动预建 **N+2 周** 分区，确保写入永不耗尽。

## 自动 cron

- 触发时点：每周一 03:00 UTC（ENV `PARTITION_MAINTENANCE_CRON`，默认 `0 3 * * 1`；空串禁用）
- 启动即触发：进程 `onModuleInit` 立即 tick 一次，避免重启窗口错过维护
- 预建水位：未来 8 周（`LOOKAHEAD_WEEKS=8`），存在跳过、缺失创建
- 失败策略：记 `WARN` 日志，不抛异常；真正告警由 `events_dlq` + M4 告警引擎兜底

## 当前已建分区

| 分区名 | 时间范围（UTC） |
|---|---|
| `events_raw_2026w17` ~ `events_raw_2026w20` | 2026-04-20 ~ 2026-05-18（初始 4 张，ADR-0017） |
| `events_raw_2026w21` ~ `events_raw_2026w25` | 2026-05-18 ~ 2026-06-22（ADR-0026 扩 5 张） |

重启 server 即会自动把未来 8 周补齐（若缺失）。

## 手工检视

```sql
-- 列出 events_raw 所有子分区
SELECT inhrelid::regclass AS partition, pg_size_pretty(pg_total_relation_size(inhrelid)) AS size
FROM pg_inherits
WHERE inhparent = 'events_raw'::regclass
ORDER BY partition;
```

## 手工补建（紧急场景）

正常情况下无需手工；仅在 cron 失败报警后参考：

```sql
-- 示例：手工补建 2026w26 分区（2026-06-22 ~ 2026-06-29）
CREATE TABLE IF NOT EXISTS events_raw_2026w26
  PARTITION OF events_raw
  FOR VALUES FROM ('2026-06-22 00:00:00+00') TO ('2026-06-29 00:00:00+00');
```

分区名遵循 `events_raw_<year>w<NN>`（ISO Week 两位补零）规则。

## 未来工作

- 老分区归档到 MinIO + `DETACH PARTITION`（见 M5 压测与优化里程碑）
- `error_events_raw` / `perf_events_raw` 等独立 raw 表暂不分区，容量到阈值时同样切换 PARTITION BY RANGE

## 相关 ADR

- [ADR-0017](https://github.com/lotosv2010/g-heal-claw/blob/main/docs/decisions/0017-drizzle-schema-baseline.md)：Drizzle Schema 基线 + `events_raw` 初始 4 张分区
- [ADR-0026](https://github.com/lotosv2010/g-heal-claw/blob/main/docs/decisions/0026-error-processor-bullmq-takeover.md)：分区维护 cron 落地
