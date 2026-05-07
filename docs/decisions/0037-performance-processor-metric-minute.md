# ADR-0037: PerformanceProcessor + metric_minute 预聚合 + Apdex cron

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-05-07 |
| 决策人 | @Robin |

## 背景

Phase 2 性能监控 Dashboard 已完成首版（ADR-0015），基于 `perf_events_raw` 实时 p75 查询。当前问题：

1. **查询成本高**：`percentile_cont` 对大数据量需全表扫描，随事件量增长 Dashboard 响应变慢
2. **无预聚合层**：告警引擎（ADR-0035）需要分钟级指标作为评估输入，直查 raw 表效率不足
3. **Apdex 缺失**：PRD §2.1 要求 Apdex 评分，当前无计算与存储

目标：引入 `metric_minute` 预聚合表 + PerformanceProcessor 异步聚合 + Apdex cron，同时将 Gateway 性能事件从同步直写迁移为异步队列（对齐 ADR-0026 Error 的模式）。

## 决策

### 1. metric_minute 表

```sql
CREATE TABLE metric_minute (
  id            BIGSERIAL PRIMARY KEY,
  project_id    VARCHAR(32) NOT NULL,
  metric        VARCHAR(16) NOT NULL,       -- 'LCP','FCP','CLS','INP','TTFB','FSP','FID','SI','TBT','apdex'
  bucket_ts     TIMESTAMPTZ NOT NULL,       -- 截断到分钟边界
  p50           DOUBLE PRECISION NOT NULL DEFAULT 0,
  p75           DOUBLE PRECISION NOT NULL DEFAULT 0,
  p90           DOUBLE PRECISION NOT NULL DEFAULT 0,
  p95           DOUBLE PRECISION NOT NULL DEFAULT 0,
  p99           DOUBLE PRECISION NOT NULL DEFAULT 0,
  count         INTEGER NOT NULL DEFAULT 0,
  sum           DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- Apdex 专用（仅 metric='apdex' 时填充）
  satisfied     INTEGER NOT NULL DEFAULT 0,
  tolerating    INTEGER NOT NULL DEFAULT 0,
  frustrated    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, metric, bucket_ts)
);
CREATE INDEX idx_mm_project_metric_ts ON metric_minute(project_id, metric, bucket_ts DESC);
```

### 2. PerformanceProcessor（BullMQ Worker）

- 消费 `events-performance` 队列（沿用 `QueueName.EventsPerformance`）
- 复用 ADR-0026 模式：`PERF_PROCESSOR_MODE=sync|queue|dual` 灰度开关
- Worker 逻辑：
  1. 接收一批 perf 事件 → `PerformanceService.saveBatch()` 落库 raw
  2. 按 `(projectId, metric, minute)` 分组 → 内存计算百分位 → UPSERT `metric_minute`
  3. 百分位使用 t-digest 近似算法（`tdigest` 包，内存 < 5KB/分钟桶）

### 3. Apdex 计算 cron

- `@Cron('*/1 * * * *')` 每分钟执行
- 查询前 1 分钟窗口的 `perf_events_raw` 中 LCP 样本
- 按项目 + 每分钟桶计算：
  - Satisfied: `value ≤ T`（默认 T=2500ms）
  - Tolerating: `T < value ≤ 4T`
  - Frustrated: `value > 4T`
  - Score = `(satisfied + tolerating/2) / total`
- UPSERT 到 `metric_minute`（metric='apdex'，p75 字段存 score）
- T 值默认 2500ms，后续通过项目配置表可覆盖

### 4. Gateway 迁移

- 新增 `PERF_PROCESSOR_MODE` 环境变量（默认 `queue`）
- Gateway 对 performance/long_task 事件按 mode 分流（同 ADR-0026 error 模式）
- `dual` 模式用于灰度对比

### 5. Dashboard API 内部切换

- 短期（本次）：Dashboard 聚合 API 保持查询 `perf_events_raw`（契约不变）
- 中期：切换为查询 `metric_minute`（对外零变更，仅内部实现替换）

## 备选方案

### 方案 B：PostgreSQL Materialized View + pg_cron

每分钟刷新 `CREATE MATERIALIZED VIEW metric_minute AS SELECT ...`。

**优点**：纯 SQL，无应用层计算。
**缺点**：REFRESH 锁表影响写入；无法增量更新；pg_cron 需额外 extension。

### 方案 C：TimescaleDB continuous aggregates

**优点**：原生支持、自动增量刷新。
**缺点**：引入 TimescaleDB 扩展，增加运维复杂度；MVP 阶段 overkill。

## 影响

- **新增表**：`metric_minute`（DDL migration `0012_metric_minute.sql`）
- **新增 Worker**：`PerformanceProcessor`（`apps/server/src/modules/performance/perf.processor.ts`）
- **新增 cron**：`ApdexService`（`apps/server/src/modules/performance/apdex.service.ts`）
- **新增依赖**：`tdigest`（百分位近似计算，~8KB）
- **环境变量新增**：`PERF_PROCESSOR_MODE`、`PERF_PROCESSOR_CONCURRENCY`、`APDEX_THRESHOLD_MS`、`APDEX_METRIC`
- **SPEC 影响**：§6.2 新增 metric_minute 表定义
- **ARCHITECTURE 影响**：§3.4 `events-performance` 🟡 → 🟢

## 后续

- Dashboard API 内部切换查询源（metric_minute 替代 raw 实时聚合）
- `metric_hour` / `metric_day` 物化视图（数据量增长后按需引入）
- 项目级 Apdex T 值配置（Settings 页面）
- AlertEvaluator 对接 metric_minute（Apdex < 0.7 触发告警）
