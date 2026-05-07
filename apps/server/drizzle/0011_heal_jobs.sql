-- Migration: 0011_heal_jobs
-- Phase 5 · ADR-0036 · AI 自愈任务表

CREATE TABLE IF NOT EXISTS heal_jobs (
  id            VARCHAR(32) PRIMARY KEY,
  project_id    VARCHAR(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  issue_id      VARCHAR(32) NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  triggered_by  VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'queued',
  repo_url      TEXT NOT NULL,
  branch        VARCHAR(128) NOT NULL DEFAULT 'main',
  diagnosis     TEXT,
  patch         TEXT,
  pr_url        TEXT,
  error_message TEXT,
  trace         JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS heal_jobs_project_idx ON heal_jobs(project_id);
CREATE INDEX IF NOT EXISTS heal_jobs_issue_idx ON heal_jobs(issue_id);
CREATE INDEX IF NOT EXISTS heal_jobs_status_idx ON heal_jobs(status);
