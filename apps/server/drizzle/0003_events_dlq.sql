-- T1.4.4 / ADR-0016 §5：死信队列
-- 存储所有落库失败 / upsert 失败的事件原文 + 失败原因 + 阶段，便于后续补偿与告警。

CREATE TABLE IF NOT EXISTS events_dlq (
  id              bigserial PRIMARY KEY,
  event_id        uuid,
  project_id      varchar(64),
  event_type      varchar(32) NOT NULL,
  stage           varchar(32) NOT NULL,
  reason          text NOT NULL,
  payload         jsonb NOT NULL,
  retry_count     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dlq_project_created
  ON events_dlq (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dlq_stage_created
  ON events_dlq (stage, created_at DESC);
