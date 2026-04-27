-- ==================================================================
-- ADR-0017 首版基线迁移：多租户主表 8 张 + 事件流 3 张（切片表 + 分区父）
-- ==================================================================
--
-- 本文件是生产/CI 迁移源真值；dev/test 由 DatabaseService.onModuleInit 跑
-- ALL_DDL 字符串数组（两条路径手工对齐；T1.1.8 CI 后补 diff 校验自动化）。
--
-- 本文件命名受 drizzle-kit 约定约束（NNNN_slug.sql），手工维护原因：
-- drizzle-kit 0.30 CJS 加载器与 apps/server 的 NodeNext `.js` 扩展解析
-- 不兼容；且 PARTITION BY RANGE 分区 DDL drizzle-kit 不支持原生输出。
-- 若后续 drizzle-kit 升级解决加载问题，可跑 `pnpm db:generate` 重新产出
-- 非分区部分，再手工追加分区 DDL（ADR-0017 §2）。
--
-- 执行方式（prod）：pnpm -F @g-heal-claw/server db:migrate

-- ==================================================================
-- 主表（FK 顺序：users → projects → 其他）
-- ==================================================================

CREATE TABLE IF NOT EXISTS users (
  id              varchar(32) PRIMARY KEY,
  email           varchar(255) NOT NULL UNIQUE,
  password_hash   varchar(255) NOT NULL,
  display_name    varchar(64),
  role            varchar(16) NOT NULL DEFAULT 'user',
  is_active       boolean NOT NULL DEFAULT true,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS projects (
  id              varchar(32) PRIMARY KEY,
  slug            varchar(64) NOT NULL UNIQUE,
  name            varchar(128) NOT NULL,
  platform        varchar(16) NOT NULL DEFAULT 'web',
  owner_user_id   varchar(32) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  retention_days  integer NOT NULL DEFAULT 30,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects (owner_user_id);

CREATE TABLE IF NOT EXISTS project_keys (
  id              varchar(32) PRIMARY KEY,
  project_id      varchar(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  public_key      varchar(64) NOT NULL UNIQUE,
  secret_key      varchar(64) NOT NULL UNIQUE,
  label           varchar(64),
  is_active       boolean NOT NULL DEFAULT true,
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_keys_public
  ON project_keys (public_key) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_project_keys_project ON project_keys (project_id);

CREATE TABLE IF NOT EXISTS project_members (
  project_id      varchar(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id         varchar(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            varchar(16) NOT NULL,
  invited_by      varchar(32) REFERENCES users(id) ON DELETE SET NULL,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON project_members (user_id);

CREATE TABLE IF NOT EXISTS environments (
  project_id      varchar(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            varchar(32) NOT NULL,
  description     text,
  is_production   boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, name)
);

CREATE TABLE IF NOT EXISTS releases (
  id              varchar(32) PRIMARY KEY,
  project_id      varchar(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version         varchar(64) NOT NULL,
  commit_sha      varchar(40),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_releases_project_version UNIQUE (project_id, version)
);
CREATE INDEX IF NOT EXISTS idx_releases_project_created
  ON releases (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS issues (
  id                    varchar(32) PRIMARY KEY,
  project_id            varchar(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fingerprint           varchar(64) NOT NULL,
  sub_type              varchar(16) NOT NULL,
  title                 text NOT NULL,
  level                 varchar(16) NOT NULL DEFAULT 'error',
  status                varchar(16) NOT NULL DEFAULT 'open',
  first_seen            timestamptz NOT NULL DEFAULT now(),
  last_seen             timestamptz NOT NULL DEFAULT now(),
  event_count           bigint NOT NULL DEFAULT 0,
  impacted_sessions     bigint NOT NULL DEFAULT 0,
  assigned_user_id      varchar(32) REFERENCES users(id) ON DELETE SET NULL,
  resolved_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_issues_project_fingerprint UNIQUE (project_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_issues_project_status_lastseen
  ON issues (project_id, status, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_issues_project_subtype_lastseen
  ON issues (project_id, sub_type, last_seen DESC);

-- ==================================================================
-- 事件流：切片表（ADR-0013 / ADR-0016；保持原 schema，不加 FK）
-- ==================================================================

CREATE TABLE IF NOT EXISTS perf_events_raw (
  id              bigserial PRIMARY KEY,
  event_id        uuid NOT NULL UNIQUE,
  project_id      varchar(64) NOT NULL,
  public_key      varchar(64) NOT NULL,
  session_id      varchar(64) NOT NULL,
  ts_ms           bigint NOT NULL,
  type            varchar(16) NOT NULL,
  metric          varchar(16),
  value           double precision,
  rating          varchar(24),
  lt_duration_ms  double precision,
  lt_start_ms     double precision,
  navigation      jsonb,
  url             text NOT NULL,
  path            text NOT NULL,
  ua              text,
  browser         varchar(64),
  os              varchar(64),
  device_type     varchar(16),
  release         varchar(64),
  environment     varchar(32),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_perf_project_ts
  ON perf_events_raw (project_id, ts_ms DESC);
CREATE INDEX IF NOT EXISTS idx_perf_project_metric_ts
  ON perf_events_raw (project_id, metric, ts_ms DESC)
  WHERE metric IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perf_project_path_ts
  ON perf_events_raw (project_id, path, ts_ms DESC);

CREATE TABLE IF NOT EXISTS error_events_raw (
  id               bigserial PRIMARY KEY,
  event_id         uuid NOT NULL UNIQUE,
  project_id       varchar(64) NOT NULL,
  public_key       varchar(64) NOT NULL,
  session_id       varchar(64) NOT NULL,
  ts_ms            bigint NOT NULL,
  sub_type         varchar(16) NOT NULL,
  message          text NOT NULL,
  message_head     varchar(128) NOT NULL,
  stack            text,
  frames           jsonb,
  component_stack  text,
  resource         jsonb,
  breadcrumbs      jsonb,
  url              text NOT NULL,
  path             text NOT NULL,
  ua               text,
  browser          varchar(64),
  os               varchar(64),
  device_type      varchar(16),
  release          varchar(64),
  environment      varchar(32),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_err_project_ts
  ON error_events_raw (project_id, ts_ms DESC);
CREATE INDEX IF NOT EXISTS idx_err_project_sub_ts
  ON error_events_raw (project_id, sub_type, ts_ms DESC);
CREATE INDEX IF NOT EXISTS idx_err_project_group_ts
  ON error_events_raw (project_id, sub_type, message_head, ts_ms DESC);

-- ==================================================================
-- 事件流：events_raw 分区父表（ADR-0017 §3.8；本期 Gateway 不写入）
-- ==================================================================

CREATE TABLE IF NOT EXISTS events_raw (
  id              bigserial,
  event_id        uuid NOT NULL,
  project_id      varchar(32) NOT NULL,
  type            varchar(32) NOT NULL,
  payload         jsonb NOT NULL,
  ingested_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, ingested_at)
) PARTITION BY RANGE (ingested_at);

CREATE TABLE IF NOT EXISTS events_raw_2026w17
  PARTITION OF events_raw
  FOR VALUES FROM ('2026-04-20') TO ('2026-04-27');

CREATE TABLE IF NOT EXISTS events_raw_2026w18
  PARTITION OF events_raw
  FOR VALUES FROM ('2026-04-27') TO ('2026-05-04');

CREATE TABLE IF NOT EXISTS events_raw_2026w19
  PARTITION OF events_raw
  FOR VALUES FROM ('2026-05-04') TO ('2026-05-11');

CREATE TABLE IF NOT EXISTS events_raw_2026w20
  PARTITION OF events_raw
  FOR VALUES FROM ('2026-05-11') TO ('2026-05-18');

CREATE INDEX IF NOT EXISTS idx_events_raw_project_type_ingested
  ON events_raw (project_id, type, ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_raw_event_id ON events_raw (event_id);
