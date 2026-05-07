-- ADR-0037: metric_minute 分钟级预聚合表
-- PerformanceProcessor 按 (project_id, metric, minute) 写入百分位统计
-- ApdexService 写入 metric='apdex' 行

CREATE TABLE IF NOT EXISTS metric_minute (
  id            BIGSERIAL PRIMARY KEY,
  project_id    VARCHAR(32) NOT NULL,
  metric        VARCHAR(16) NOT NULL,
  bucket_ts     TIMESTAMPTZ NOT NULL,
  p50           DOUBLE PRECISION NOT NULL DEFAULT 0,
  p75           DOUBLE PRECISION NOT NULL DEFAULT 0,
  p90           DOUBLE PRECISION NOT NULL DEFAULT 0,
  p95           DOUBLE PRECISION NOT NULL DEFAULT 0,
  p99           DOUBLE PRECISION NOT NULL DEFAULT 0,
  count         INTEGER NOT NULL DEFAULT 0,
  sum           DOUBLE PRECISION NOT NULL DEFAULT 0,
  satisfied     INTEGER NOT NULL DEFAULT 0,
  tolerating    INTEGER NOT NULL DEFAULT 0,
  frustrated    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 唯一约束：每个项目 + 指标 + 分钟桶只有一行（UPSERT 幂等）
CREATE UNIQUE INDEX IF NOT EXISTS uq_mm_project_metric_ts
  ON metric_minute(project_id, metric, bucket_ts);

-- 查询索引：按项目 + 指标 + 时间范围查询
CREATE INDEX IF NOT EXISTS idx_mm_project_metric_ts
  ON metric_minute(project_id, metric, bucket_ts DESC);
