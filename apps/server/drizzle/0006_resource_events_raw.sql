-- ADR-0022 §2：静态资源明细原始表
-- 承载 resourcePlugin（type='resource'）通过 PerformanceObserver('resource') 采集的
-- 全量静态资源加载明细，供 Dashboard `/dashboard/v1/resources/overview` 聚合吞吐/
-- 失败率/慢占比/p75/分类分布/Top 慢资源/Top 失败 host。
-- 与 api_events_raw 的分工：fetch/XHR 归 api_events_raw，
-- script/stylesheet/image/font/media/other（排除 fetch/xhr/beacon）归 resource_events_raw。

CREATE TABLE IF NOT EXISTS resource_events_raw (
  id                bigserial PRIMARY KEY,
  event_id          uuid NOT NULL UNIQUE,
  project_id        varchar(64) NOT NULL,
  public_key        varchar(64) NOT NULL,
  session_id        varchar(64) NOT NULL,
  ts_ms             bigint NOT NULL,
  category          varchar(16) NOT NULL,
  initiator_type    varchar(32) NOT NULL,
  host              varchar(128) NOT NULL,
  url               text NOT NULL,
  duration_ms       double precision NOT NULL,
  transfer_size     integer,
  encoded_size      integer,
  decoded_size      integer,
  protocol          varchar(32),
  cache             varchar(16) NOT NULL DEFAULT 'unknown',
  slow              boolean NOT NULL DEFAULT false,
  failed            boolean NOT NULL DEFAULT false,
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

CREATE INDEX IF NOT EXISTS idx_res_project_ts
  ON resource_events_raw (project_id, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_res_project_category_ts
  ON resource_events_raw (project_id, category, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_res_project_host_ts
  ON resource_events_raw (project_id, host, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_res_project_failed_ts
  ON resource_events_raw (project_id, failed, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_res_project_slow_ts
  ON resource_events_raw (project_id, slow, ts_ms DESC);
