-- ADR-0020 §4.2：API 请求明细原始表
-- 承载 apiPlugin（type='api'）上报的全部 fetch/XHR 明细（含成功），
-- 供 Dashboard `/dashboard/v1/api/overview` 聚合吞吐 / 慢请求 Top / 错误率 / 状态码分布。
-- 与 error_events_raw 分工：错误明细归 error_events_raw（httpPlugin），
-- 成功+失败全量监控归 api_events_raw。

CREATE TABLE IF NOT EXISTS api_events_raw (
  id                bigserial PRIMARY KEY,
  event_id          uuid NOT NULL UNIQUE,
  project_id        varchar(64) NOT NULL,
  public_key        varchar(64) NOT NULL,
  session_id        varchar(64) NOT NULL,
  ts_ms             bigint NOT NULL,
  method            varchar(16) NOT NULL,
  request_url       text NOT NULL,
  host              varchar(128) NOT NULL,
  path              text NOT NULL,
  path_template     text NOT NULL,
  status            integer NOT NULL,
  duration_ms       double precision NOT NULL,
  request_size      integer,
  response_size     integer,
  slow              boolean NOT NULL DEFAULT false,
  failed            boolean NOT NULL DEFAULT false,
  error_message     text,
  trace_id          varchar(64),
  breadcrumbs       jsonb,
  page_url          text NOT NULL,
  page_path         text NOT NULL,
  ua                text,
  browser           varchar(64),
  os                varchar(64),
  device_type       varchar(16),
  release           varchar(64),
  environment       varchar(32),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_project_ts
  ON api_events_raw (project_id, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_api_project_host_ts
  ON api_events_raw (project_id, host, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_api_project_status_ts
  ON api_events_raw (project_id, status, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_api_project_path_ts
  ON api_events_raw (project_id, path_template, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_api_project_failed_ts
  ON api_events_raw (project_id, failed, ts_ms DESC);
