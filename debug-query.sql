-- 调试 SQL：检查数据存在性和查询条件

-- 1. 查看所有项目的事件统计
SELECT
  project_id,
  COUNT(*) as event_count,
  MIN(ts_ms) as earliest_ts,
  MAX(ts_ms) as latest_ts,
  to_timestamp(MIN(ts_ms) / 1000) as earliest_time,
  to_timestamp(MAX(ts_ms) / 1000) as latest_time
FROM error_events_raw
GROUP BY project_id;

-- 2. 查看最近 24 小时的事件（project_id='demo'）
SELECT
  COUNT(*) as events_last_24h,
  COUNT(DISTINCT session_id) as unique_sessions
FROM error_events_raw
WHERE project_id = 'demo'
  AND ts_ms >= EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours') * 1000
  AND ts_ms < EXTRACT(EPOCH FROM NOW()) * 1000;

-- 3. 查看最近 5 条事件的详情
SELECT
  project_id,
  ts_ms,
  to_timestamp(ts_ms / 1000) as event_time,
  sub_type,
  message,
  environment
FROM error_events_raw
WHERE project_id = 'demo'
ORDER BY ts_ms DESC
LIMIT 5;

-- 4. 检查其他类型的事件表
SELECT 'perf_events_raw' as table_name, COUNT(*) as count FROM perf_events_raw WHERE project_id = 'demo'
UNION ALL
SELECT 'api_events_raw', COUNT(*) FROM api_events_raw WHERE project_id = 'demo'
UNION ALL
SELECT 'resource_events_raw', COUNT(*) FROM resource_events_raw WHERE project_id = 'demo'
UNION ALL
SELECT 'track_events_raw', COUNT(*) FROM track_events_raw WHERE project_id = 'demo'
UNION ALL
SELECT 'page_view_raw', COUNT(*) FROM page_view_raw WHERE project_id = 'demo';

-- 5. 检查当前时间和时区
SELECT
  NOW() as current_time,
  EXTRACT(EPOCH FROM NOW()) * 1000 as current_ts_ms,
  EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours') * 1000 as window_start_ts;
