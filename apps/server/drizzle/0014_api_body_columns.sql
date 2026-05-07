-- T2.2.2: api_events_raw 新增请求/响应体截断字段
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS request_body TEXT;
ALTER TABLE api_events_raw ADD COLUMN IF NOT EXISTS response_body TEXT;
