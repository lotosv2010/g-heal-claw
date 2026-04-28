-- ==================================================================
-- ADR-0016 扩展：异常事件表新增 resource_kind + ajax/api_code 请求字段
-- ==================================================================
--
-- 背景：SPEC 9 分类要求
--   - resource 拆分为 js_load / css_load / image_load / media（resource_kind 列）
--   - ajax / api_code 新增（由 SDK httpPlugin 上报 → request_* 列结构化）
--
-- 幂等：既有 0001 数据库通过 ADD COLUMN IF NOT EXISTS 原地升级。
-- 新库：0001 执行后续 DDL（error_events_raw）未包含这些列，但 DatabaseService
-- 引入 ALL_DDL 会再跑 CREATE TABLE IF NOT EXISTS + ALTER ADD IF NOT EXISTS；
-- 生产走本迁移即可。
-- ==================================================================

ALTER TABLE error_events_raw
  ADD COLUMN IF NOT EXISTS resource_kind       varchar(16),
  ADD COLUMN IF NOT EXISTS request_url         text,
  ADD COLUMN IF NOT EXISTS request_method      varchar(16),
  ADD COLUMN IF NOT EXISTS request_status      integer,
  ADD COLUMN IF NOT EXISTS request_duration_ms double precision,
  ADD COLUMN IF NOT EXISTS request_biz_code    varchar(64);

CREATE INDEX IF NOT EXISTS idx_err_project_kind_ts
  ON error_events_raw (project_id, sub_type, resource_kind, ts_ms DESC);
