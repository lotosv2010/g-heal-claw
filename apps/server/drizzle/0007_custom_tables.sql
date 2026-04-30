-- ADR-0023 §3：自定义上报 + 日志查询切片（TM.1.C）
-- 承载 customPlugin 主动业务 API（track / time / log / captureMessage）产出的三类事件：
--   custom_events_raw  — GHealClaw.track(name, properties) → type='custom_event'
--   custom_metrics_raw — GHealClaw.time(name, durationMs) → type='custom_metric'
--   custom_logs_raw    — GHealClaw.log(level, message, data) → type='custom_log'
--
-- 与 track_events_raw（trackPlugin 被动 DOM 采集）在 type 维度完全独立；
-- 三张分表而非合表，聚合 SQL 不需按 type 过滤，索引开销更低，列稀疏度友好。

-- ============================================================
-- custom_events_raw：业务埋点
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_events_raw (
  id              bigserial PRIMARY KEY,
  event_id        uuid NOT NULL UNIQUE,
  project_id      varchar(64) NOT NULL,
  public_key      varchar(64) NOT NULL,
  session_id      varchar(64) NOT NULL,
  ts_ms           bigint NOT NULL,
  name            varchar(128) NOT NULL,
  properties      jsonb NOT NULL DEFAULT '{}'::jsonb,
  page_url        text NOT NULL,
  page_path       text NOT NULL,
  ua              text,
  browser         varchar(64),
  os              varchar(64),
  device_type     varchar(16),
  release         varchar(64),
  environment     varchar(32),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_event_project_ts
  ON custom_events_raw (project_id, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_custom_event_project_name_ts
  ON custom_events_raw (project_id, name, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_custom_event_project_path_ts
  ON custom_events_raw (project_id, page_path, ts_ms DESC);

-- ============================================================
-- custom_metrics_raw：业务测速
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_metrics_raw (
  id              bigserial PRIMARY KEY,
  event_id        uuid NOT NULL UNIQUE,
  project_id      varchar(64) NOT NULL,
  public_key      varchar(64) NOT NULL,
  session_id      varchar(64) NOT NULL,
  ts_ms           bigint NOT NULL,
  name            varchar(128) NOT NULL,
  duration_ms     double precision NOT NULL,
  properties      jsonb,
  page_url        text NOT NULL,
  page_path       text NOT NULL,
  ua              text,
  browser         varchar(64),
  os              varchar(64),
  device_type     varchar(16),
  release         varchar(64),
  environment     varchar(32),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_metric_project_ts
  ON custom_metrics_raw (project_id, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_custom_metric_project_name_ts
  ON custom_metrics_raw (project_id, name, ts_ms DESC);

-- ============================================================
-- custom_logs_raw：分级日志
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_logs_raw (
  id              bigserial PRIMARY KEY,
  event_id        uuid NOT NULL UNIQUE,
  project_id      varchar(64) NOT NULL,
  public_key      varchar(64) NOT NULL,
  session_id      varchar(64) NOT NULL,
  ts_ms           bigint NOT NULL,
  level           varchar(8) NOT NULL,
  message         text NOT NULL,
  message_head    varchar(128) NOT NULL,
  data            jsonb,
  page_url        text NOT NULL,
  page_path       text NOT NULL,
  ua              text,
  browser         varchar(64),
  os              varchar(64),
  device_type     varchar(16),
  release         varchar(64),
  environment     varchar(32),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_log_project_ts
  ON custom_logs_raw (project_id, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_custom_log_project_level_ts
  ON custom_logs_raw (project_id, level, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_custom_log_project_level_head_ts
  ON custom_logs_raw (project_id, level, message_head, ts_ms DESC);
