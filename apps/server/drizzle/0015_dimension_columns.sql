-- 维度扩列：所有 raw 表新增 browser_version / os_version / network_type / country / region
-- 使 Dashboard 维度分布 8 Tab 中的"版本 / 地域 / 网络"可用

-- perf_events_raw
ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS browser_version VARCHAR(32);
ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS os_version VARCHAR(32);
ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS network_type VARCHAR(16);
ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS country VARCHAR(64);
ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS region VARCHAR(64);

-- error_events_raw
ALTER TABLE error_events_raw ADD COLUMN IF NOT EXISTS browser_version VARCHAR(32);
ALTER TABLE error_events_raw ADD COLUMN IF NOT EXISTS os_version VARCHAR(32);
ALTER TABLE error_events_raw ADD COLUMN IF NOT EXISTS network_type VARCHAR(16);
ALTER TABLE error_events_raw ADD COLUMN IF NOT EXISTS country VARCHAR(64);
ALTER TABLE error_events_raw ADD COLUMN IF NOT EXISTS region VARCHAR(64);

-- api_events_raw
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS browser_version VARCHAR(32);
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS os_version VARCHAR(32);
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS network_type VARCHAR(16);
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS country VARCHAR(64);
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS region VARCHAR(64);

-- resource_events_raw
ALTER TABLE resource_events_raw ADD COLUMN IF NOT EXISTS browser_version VARCHAR(32);
ALTER TABLE resource_events_raw ADD COLUMN IF NOT EXISTS os_version VARCHAR(32);
ALTER TABLE resource_events_raw ADD COLUMN IF NOT EXISTS network_type VARCHAR(16);
ALTER TABLE resource_events_raw ADD COLUMN IF NOT EXISTS country VARCHAR(64);
ALTER TABLE resource_events_raw ADD COLUMN IF NOT EXISTS region VARCHAR(64);

-- page_view_raw (already has country/region, add browser_version/os_version/network_type)
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS browser_version VARCHAR(32);
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS os_version VARCHAR(32);
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS network_type VARCHAR(16);
