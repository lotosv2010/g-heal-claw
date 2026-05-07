-- T2.3.3: page_view_raw 新增地域字段（GeoIP 解析填充）
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS country VARCHAR(64);
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS region VARCHAR(64);
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS city VARCHAR(64);

-- 地域维度聚合索引
CREATE INDEX IF NOT EXISTS idx_pv_project_country_ts
  ON page_view_raw(project_id, country, ts_ms);
