-- ADR-0035: 告警引擎 3 张表

CREATE TABLE IF NOT EXISTS alert_rules (
  id          VARCHAR(32) PRIMARY KEY,
  project_id  VARCHAR(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(128) NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  target      VARCHAR(32) NOT NULL,
  filter      JSONB DEFAULT '{}',
  condition   JSONB NOT NULL,
  severity    VARCHAR(16) NOT NULL DEFAULT 'warning',
  cooldown_ms INTEGER NOT NULL DEFAULT 300000,
  channels    TEXT[] NOT NULL DEFAULT '{}',
  last_fired_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_project ON alert_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(project_id, enabled);

CREATE TABLE IF NOT EXISTS alert_history (
  id          VARCHAR(32) PRIMARY KEY,
  rule_id     VARCHAR(32) NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  project_id  VARCHAR(32) NOT NULL,
  status      VARCHAR(16) NOT NULL DEFAULT 'firing',
  metric_value DOUBLE PRECISION,
  threshold   DOUBLE PRECISION,
  fired_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  notified    BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_alert_history_rule ON alert_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_project_status ON alert_history(project_id, status);

CREATE TABLE IF NOT EXISTS channels (
  id          VARCHAR(32) PRIMARY KEY,
  project_id  VARCHAR(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(128) NOT NULL,
  type        VARCHAR(16) NOT NULL,
  config      JSONB NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_project ON channels(project_id);
