-- ADR-0020 Tier 2.A：页面访问原始表
-- 承载 pageViewPlugin（type='page_view'）上报的每一次页面进入（含 SPA 切换），
-- 供 Dashboard `/dashboard/v1/visits/overview` 聚合 PV/UV/TopPages/TopReferrers/Trend。
-- 与 track_events_raw 分工：track 是主动交互埋点；page_view 是导航独立流。

CREATE TABLE IF NOT EXISTS page_view_raw (
  id              bigserial PRIMARY KEY,
  event_id        uuid NOT NULL UNIQUE,
  project_id      varchar(64) NOT NULL,
  public_key      varchar(64) NOT NULL,
  session_id      varchar(64) NOT NULL,
  ts_ms           bigint NOT NULL,
  url             text NOT NULL,
  path            text NOT NULL,
  referrer        text,
  referrer_host   varchar(128),
  load_type       varchar(16) NOT NULL,
  is_spa_nav      boolean NOT NULL DEFAULT false,
  duration_ms     double precision,
  ua              text,
  browser         varchar(64),
  os              varchar(64),
  device_type     varchar(16),
  release         varchar(64),
  environment     varchar(32),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv_project_ts
  ON page_view_raw (project_id, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_pv_project_path_ts
  ON page_view_raw (project_id, path, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_pv_project_session_ts
  ON page_view_raw (project_id, session_id, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_pv_project_loadtype_ts
  ON page_view_raw (project_id, load_type, ts_ms DESC);
