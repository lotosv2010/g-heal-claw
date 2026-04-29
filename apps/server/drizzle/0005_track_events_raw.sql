-- P0-3 §1：埋点事件原始表
-- 承载 trackPlugin（type='track'）的 code / click / expose / submit 明细，
-- 供 Dashboard `/dashboard/v1/tracking/overview` 聚合 PV / UV / Top 事件 / 趋势。

CREATE TABLE IF NOT EXISTS track_events_raw (
  id                bigserial PRIMARY KEY,
  event_id          uuid NOT NULL UNIQUE,
  project_id        varchar(64) NOT NULL,
  public_key        varchar(64) NOT NULL,
  session_id        varchar(64) NOT NULL,
  ts_ms             bigint NOT NULL,
  track_type        varchar(16) NOT NULL,
  event_name        varchar(128) NOT NULL,
  target_tag        varchar(32),
  target_id         varchar(128),
  target_class      text,
  target_selector   text,
  target_text       text,
  properties        jsonb,
  user_id           varchar(64),
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

CREATE INDEX IF NOT EXISTS idx_track_project_ts
  ON track_events_raw (project_id, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_track_project_type_ts
  ON track_events_raw (project_id, track_type, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_track_project_name_ts
  ON track_events_raw (project_id, event_name, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_track_project_path_ts
  ON track_events_raw (project_id, page_path, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_track_project_session_ts
  ON track_events_raw (project_id, session_id, ts_ms DESC);
