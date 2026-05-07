-- ADR-0038：未入库 SDK 字段全量持久化
-- 层级 1：9 张 raw 表通用字段（tags / context / user_id / page_title / screen_* / language / timezone）
-- 层级 2：page_view_raw 额外 UTM + 流量归因
-- 层级 3：perf_events_raw 额外 lt_tier

-- ============================================================
-- 层级 1：通用字段（9 表 × 9 列 = 81 条）
-- ============================================================

-- error_events_raw
ALTER TABLE error_events_raw ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE error_events_raw ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE error_events_raw ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
ALTER TABLE error_events_raw ADD COLUMN IF NOT EXISTS page_title TEXT;
ALTER TABLE error_events_raw ADD COLUMN IF NOT EXISTS screen_width INTEGER;
ALTER TABLE error_events_raw ADD COLUMN IF NOT EXISTS screen_height INTEGER;
ALTER TABLE error_events_raw ADD COLUMN IF NOT EXISTS screen_dpr DOUBLE PRECISION;
ALTER TABLE error_events_raw ADD COLUMN IF NOT EXISTS language VARCHAR(16);
ALTER TABLE error_events_raw ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);

-- api_events_raw
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS page_title TEXT;
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS screen_width INTEGER;
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS screen_height INTEGER;
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS screen_dpr DOUBLE PRECISION;
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS language VARCHAR(16);
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);

-- perf_events_raw
ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS page_title TEXT;
ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS screen_width INTEGER;
ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS screen_height INTEGER;
ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS screen_dpr DOUBLE PRECISION;
ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS language VARCHAR(16);
ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);

-- resource_events_raw
ALTER TABLE resource_events_raw ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE resource_events_raw ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE resource_events_raw ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
ALTER TABLE resource_events_raw ADD COLUMN IF NOT EXISTS page_title TEXT;
ALTER TABLE resource_events_raw ADD COLUMN IF NOT EXISTS screen_width INTEGER;
ALTER TABLE resource_events_raw ADD COLUMN IF NOT EXISTS screen_height INTEGER;
ALTER TABLE resource_events_raw ADD COLUMN IF NOT EXISTS screen_dpr DOUBLE PRECISION;
ALTER TABLE resource_events_raw ADD COLUMN IF NOT EXISTS language VARCHAR(16);
ALTER TABLE resource_events_raw ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);

-- page_view_raw
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS page_title TEXT;
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS screen_width INTEGER;
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS screen_height INTEGER;
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS screen_dpr DOUBLE PRECISION;
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS language VARCHAR(16);
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);

-- track_events_raw (user_id 已存在，跳过)
ALTER TABLE track_events_raw ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE track_events_raw ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE track_events_raw ADD COLUMN IF NOT EXISTS page_title TEXT;
ALTER TABLE track_events_raw ADD COLUMN IF NOT EXISTS screen_width INTEGER;
ALTER TABLE track_events_raw ADD COLUMN IF NOT EXISTS screen_height INTEGER;
ALTER TABLE track_events_raw ADD COLUMN IF NOT EXISTS screen_dpr DOUBLE PRECISION;
ALTER TABLE track_events_raw ADD COLUMN IF NOT EXISTS language VARCHAR(16);
ALTER TABLE track_events_raw ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);

-- custom_events_raw
ALTER TABLE custom_events_raw ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE custom_events_raw ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE custom_events_raw ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
ALTER TABLE custom_events_raw ADD COLUMN IF NOT EXISTS page_title TEXT;
ALTER TABLE custom_events_raw ADD COLUMN IF NOT EXISTS screen_width INTEGER;
ALTER TABLE custom_events_raw ADD COLUMN IF NOT EXISTS screen_height INTEGER;
ALTER TABLE custom_events_raw ADD COLUMN IF NOT EXISTS screen_dpr DOUBLE PRECISION;
ALTER TABLE custom_events_raw ADD COLUMN IF NOT EXISTS language VARCHAR(16);
ALTER TABLE custom_events_raw ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);

-- custom_metrics_raw
ALTER TABLE custom_metrics_raw ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE custom_metrics_raw ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE custom_metrics_raw ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
ALTER TABLE custom_metrics_raw ADD COLUMN IF NOT EXISTS page_title TEXT;
ALTER TABLE custom_metrics_raw ADD COLUMN IF NOT EXISTS screen_width INTEGER;
ALTER TABLE custom_metrics_raw ADD COLUMN IF NOT EXISTS screen_height INTEGER;
ALTER TABLE custom_metrics_raw ADD COLUMN IF NOT EXISTS screen_dpr DOUBLE PRECISION;
ALTER TABLE custom_metrics_raw ADD COLUMN IF NOT EXISTS language VARCHAR(16);
ALTER TABLE custom_metrics_raw ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);

-- custom_logs_raw
ALTER TABLE custom_logs_raw ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE custom_logs_raw ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE custom_logs_raw ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
ALTER TABLE custom_logs_raw ADD COLUMN IF NOT EXISTS page_title TEXT;
ALTER TABLE custom_logs_raw ADD COLUMN IF NOT EXISTS screen_width INTEGER;
ALTER TABLE custom_logs_raw ADD COLUMN IF NOT EXISTS screen_height INTEGER;
ALTER TABLE custom_logs_raw ADD COLUMN IF NOT EXISTS screen_dpr DOUBLE PRECISION;
ALTER TABLE custom_logs_raw ADD COLUMN IF NOT EXISTS language VARCHAR(16);
ALTER TABLE custom_logs_raw ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);

-- ============================================================
-- 层级 2：page_view_raw UTM + 流量归因（7 列）
-- ============================================================

ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS utm_source VARCHAR(128);
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(128);
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(128);
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS utm_term VARCHAR(128);
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS utm_content VARCHAR(128);
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS search_engine VARCHAR(32);
ALTER TABLE page_view_raw ADD COLUMN IF NOT EXISTS channel VARCHAR(64);

-- ============================================================
-- 层级 3：perf_events_raw lt_tier（1 列）
-- ============================================================

ALTER TABLE perf_events_raw ADD COLUMN IF NOT EXISTS lt_tier VARCHAR(16);
