/**
 * 启动期 DDL（ADR-0017 §2）
 *
 * - dev / test：DatabaseService.onModuleInit 按顺序执行 ALL_DDL（幂等 CREATE IF NOT EXISTS）
 * - CI / production：走 drizzle-kit migrate（apps/server/drizzle/*.sql），本文件与之手工对齐
 *
 * FK 顺序：users → projects → (project_keys / project_members / environments / releases / issues)
 * 事件流表（events_raw / perf / error）独立于主表，不加 FK（ADR-0017 §3.2 备注）。
 */

// ============================================================
// 主表：users（ADR-0017 §3.1）
// ============================================================

export const CREATE_USERS = `
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
`.trim();

export const CREATE_IDX_USERS_EMAIL = `
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
`.trim();

// ============================================================
// 主表：projects（ADR-0017 §3.2）
// ============================================================

export const CREATE_PROJECTS = `
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
`.trim();

export const CREATE_IDX_PROJECTS_OWNER = `
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects (owner_user_id);
`.trim();

// ============================================================
// 主表：project_keys（ADR-0017 §3.3）
// ============================================================

export const CREATE_PROJECT_KEYS = `
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
`.trim();

// partial index：Gateway 鉴权仅走热集合（ADR-0017 §3.3）
export const CREATE_IDX_PROJECT_KEYS_PUBLIC = `
CREATE INDEX IF NOT EXISTS idx_project_keys_public
  ON project_keys (public_key) WHERE is_active = true;
`.trim();

export const CREATE_IDX_PROJECT_KEYS_PROJECT = `
CREATE INDEX IF NOT EXISTS idx_project_keys_project ON project_keys (project_id);
`.trim();

// ============================================================
// 主表：project_members（ADR-0017 §3.4）
// ============================================================

export const CREATE_PROJECT_MEMBERS = `
CREATE TABLE IF NOT EXISTS project_members (
  project_id      varchar(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id         varchar(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            varchar(16) NOT NULL,
  invited_by      varchar(32) REFERENCES users(id) ON DELETE SET NULL,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
`.trim();

export const CREATE_IDX_MEMBERS_USER = `
CREATE INDEX IF NOT EXISTS idx_members_user ON project_members (user_id);
`.trim();

// ============================================================
// 主表：environments（ADR-0017 §3.5）
// ============================================================

export const CREATE_ENVIRONMENTS = `
CREATE TABLE IF NOT EXISTS environments (
  project_id      varchar(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            varchar(32) NOT NULL,
  description     text,
  is_production   boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, name)
);
`.trim();

// ============================================================
// 主表：releases（ADR-0017 §3.6）
// ============================================================

export const CREATE_RELEASES = `
CREATE TABLE IF NOT EXISTS releases (
  id              varchar(32) PRIMARY KEY,
  project_id      varchar(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version         varchar(64) NOT NULL,
  commit_sha      varchar(40),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_releases_project_version UNIQUE (project_id, version)
);
`.trim();

export const CREATE_IDX_RELEASES_PROJECT_CREATED = `
CREATE INDEX IF NOT EXISTS idx_releases_project_created
  ON releases (project_id, created_at DESC);
`.trim();

// ============================================================
// 主表：issues（ADR-0017 §3.7，本期仅建表不写入）
// ============================================================

export const CREATE_ISSUES = `
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
`.trim();

export const CREATE_IDX_ISSUES_STATUS_LASTSEEN = `
CREATE INDEX IF NOT EXISTS idx_issues_project_status_lastseen
  ON issues (project_id, status, last_seen DESC);
`.trim();

export const CREATE_IDX_ISSUES_SUBTYPE_LASTSEEN = `
CREATE INDEX IF NOT EXISTS idx_issues_project_subtype_lastseen
  ON issues (project_id, sub_type, last_seen DESC);
`.trim();

// ============================================================
// 事件流切片：perf_events_raw（ADR-0013，保持不变）
// ============================================================

export const CREATE_PERF_EVENTS_RAW = `
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
`.trim();

export const CREATE_IDX_PERF_PROJECT_TS = `
CREATE INDEX IF NOT EXISTS idx_perf_project_ts
  ON perf_events_raw (project_id, ts_ms DESC);
`.trim();

export const CREATE_IDX_PERF_PROJECT_METRIC_TS = `
CREATE INDEX IF NOT EXISTS idx_perf_project_metric_ts
  ON perf_events_raw (project_id, metric, ts_ms DESC)
  WHERE metric IS NOT NULL;
`.trim();

export const CREATE_IDX_PERF_PROJECT_PATH_TS = `
CREATE INDEX IF NOT EXISTS idx_perf_project_path_ts
  ON perf_events_raw (project_id, path, ts_ms DESC);
`.trim();

// ============================================================
// 事件流切片：error_events_raw（ADR-0016，保持不变）
// ============================================================

export const CREATE_ERROR_EVENTS_RAW = `
CREATE TABLE IF NOT EXISTS error_events_raw (
  id                   bigserial PRIMARY KEY,
  event_id             uuid NOT NULL UNIQUE,
  project_id           varchar(64) NOT NULL,
  public_key           varchar(64) NOT NULL,
  session_id           varchar(64) NOT NULL,
  ts_ms                bigint NOT NULL,
  sub_type             varchar(16) NOT NULL,
  resource_kind        varchar(16),
  message              text NOT NULL,
  message_head         varchar(128) NOT NULL,
  stack                text,
  frames               jsonb,
  component_stack      text,
  resource             jsonb,
  breadcrumbs          jsonb,
  request_url          text,
  request_method       varchar(16),
  request_status       integer,
  request_duration_ms  double precision,
  request_biz_code     varchar(64),
  url                  text NOT NULL,
  path                 text NOT NULL,
  ua                   text,
  browser              varchar(64),
  os                   varchar(64),
  device_type          varchar(16),
  release              varchar(64),
  environment          varchar(32),
  created_at           timestamptz NOT NULL DEFAULT now()
);
`.trim();

/**
 * 旧 DB 升级路径：新增列以幂等方式加入；首次运行后 create table 会把列带上，
 * 之后重跑走 ADD COLUMN IF NOT EXISTS 走 no-op
 */
export const ALTER_ERROR_EVENTS_RAW_ADD_COLUMNS = `
ALTER TABLE error_events_raw
  ADD COLUMN IF NOT EXISTS resource_kind       varchar(16),
  ADD COLUMN IF NOT EXISTS request_url         text,
  ADD COLUMN IF NOT EXISTS request_method      varchar(16),
  ADD COLUMN IF NOT EXISTS request_status      integer,
  ADD COLUMN IF NOT EXISTS request_duration_ms double precision,
  ADD COLUMN IF NOT EXISTS request_biz_code    varchar(64);
`.trim();

export const CREATE_IDX_ERR_PROJECT_TS = `
CREATE INDEX IF NOT EXISTS idx_err_project_ts
  ON error_events_raw (project_id, ts_ms DESC);
`.trim();

export const CREATE_IDX_ERR_PROJECT_SUB_TS = `
CREATE INDEX IF NOT EXISTS idx_err_project_sub_ts
  ON error_events_raw (project_id, sub_type, ts_ms DESC);
`.trim();

export const CREATE_IDX_ERR_PROJECT_GROUP_TS = `
CREATE INDEX IF NOT EXISTS idx_err_project_group_ts
  ON error_events_raw (project_id, sub_type, message_head, ts_ms DESC);
`.trim();

export const CREATE_IDX_ERR_PROJECT_KIND_TS = `
CREATE INDEX IF NOT EXISTS idx_err_project_kind_ts
  ON error_events_raw (project_id, sub_type, resource_kind, ts_ms DESC);
`.trim();

// ============================================================
// 事件流切片：api_events_raw（ADR-0020 §4.2）
// ============================================================

export const CREATE_API_EVENTS_RAW = `
CREATE TABLE IF NOT EXISTS api_events_raw (
  id                bigserial PRIMARY KEY,
  event_id          uuid NOT NULL UNIQUE,
  project_id        varchar(64) NOT NULL,
  public_key        varchar(64) NOT NULL,
  session_id        varchar(64) NOT NULL,
  ts_ms             bigint NOT NULL,
  method            varchar(16) NOT NULL,
  request_url       text NOT NULL,
  host              varchar(128) NOT NULL,
  path              text NOT NULL,
  path_template     text NOT NULL,
  status            integer NOT NULL,
  duration_ms       double precision NOT NULL,
  request_size      integer,
  response_size     integer,
  slow              boolean NOT NULL DEFAULT false,
  failed            boolean NOT NULL DEFAULT false,
  error_message     text,
  trace_id          varchar(64),
  breadcrumbs       jsonb,
  page_url          text NOT NULL,
  page_path         text NOT NULL,
  ua                text,
  browser           varchar(64),
  os                varchar(64),
  device_type       varchar(16),
  release           varchar(64),
  environment       varchar(32),
  created_at        timestamptz NOT NULL DEFAULT now()
);
`.trim();

export const CREATE_IDX_API_PROJECT_TS = `
CREATE INDEX IF NOT EXISTS idx_api_project_ts
  ON api_events_raw (project_id, ts_ms DESC);
`.trim();

export const CREATE_IDX_API_PROJECT_HOST_TS = `
CREATE INDEX IF NOT EXISTS idx_api_project_host_ts
  ON api_events_raw (project_id, host, ts_ms DESC);
`.trim();

export const CREATE_IDX_API_PROJECT_STATUS_TS = `
CREATE INDEX IF NOT EXISTS idx_api_project_status_ts
  ON api_events_raw (project_id, status, ts_ms DESC);
`.trim();

export const CREATE_IDX_API_PROJECT_PATH_TS = `
CREATE INDEX IF NOT EXISTS idx_api_project_path_ts
  ON api_events_raw (project_id, path_template, ts_ms DESC);
`.trim();

export const CREATE_IDX_API_PROJECT_FAILED_TS = `
CREATE INDEX IF NOT EXISTS idx_api_project_failed_ts
  ON api_events_raw (project_id, failed, ts_ms DESC);
`.trim();

export const API_DDL: readonly string[] = [
  CREATE_API_EVENTS_RAW,
  CREATE_IDX_API_PROJECT_TS,
  CREATE_IDX_API_PROJECT_HOST_TS,
  CREATE_IDX_API_PROJECT_STATUS_TS,
  CREATE_IDX_API_PROJECT_PATH_TS,
  CREATE_IDX_API_PROJECT_FAILED_TS,
];

// ============================================================
// 事件流：events_raw 分区父表（ADR-0017 §3.8）
// ============================================================
// 本期仅建骨架，Gateway 不写入；T1.4.1 完整 Processor 切入后启用。
// Drizzle ORM 不支持 PARTITION BY RANGE 原生 DSL → 全部手写 SQL。
// 分区键 (ingested_at) 必须进 PK，故 PK = (id, ingested_at)。

export const CREATE_EVENTS_RAW = `
CREATE TABLE IF NOT EXISTS events_raw (
  id              bigserial,
  event_id        uuid NOT NULL,
  project_id      varchar(32) NOT NULL,
  type            varchar(32) NOT NULL,
  payload         jsonb NOT NULL,
  ingested_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, ingested_at)
) PARTITION BY RANGE (ingested_at);
`.trim();

// 初始 4 张周分区（ADR-0017 §3.8；覆盖 2026-04-20 ~ 2026-05-18）
export const CREATE_EVENTS_RAW_2026W17 = `
CREATE TABLE IF NOT EXISTS events_raw_2026w17
  PARTITION OF events_raw
  FOR VALUES FROM ('2026-04-20') TO ('2026-04-27');
`.trim();

export const CREATE_EVENTS_RAW_2026W18 = `
CREATE TABLE IF NOT EXISTS events_raw_2026w18
  PARTITION OF events_raw
  FOR VALUES FROM ('2026-04-27') TO ('2026-05-04');
`.trim();

export const CREATE_EVENTS_RAW_2026W19 = `
CREATE TABLE IF NOT EXISTS events_raw_2026w19
  PARTITION OF events_raw
  FOR VALUES FROM ('2026-05-04') TO ('2026-05-11');
`.trim();

export const CREATE_EVENTS_RAW_2026W20 = `
CREATE TABLE IF NOT EXISTS events_raw_2026w20
  PARTITION OF events_raw
  FOR VALUES FROM ('2026-05-11') TO ('2026-05-18');
`.trim();

// 父表索引（自动下推所有子分区）
export const CREATE_IDX_EVENTS_RAW_PROJECT_TYPE_INGESTED = `
CREATE INDEX IF NOT EXISTS idx_events_raw_project_type_ingested
  ON events_raw (project_id, type, ingested_at DESC);
`.trim();

export const CREATE_IDX_EVENTS_RAW_EVENT_ID = `
CREATE INDEX IF NOT EXISTS idx_events_raw_event_id ON events_raw (event_id);
`.trim();

// ============================================================
// 死信队列：events_dlq（ADR-0016 §5 / T1.4.4）
// ============================================================
// 作用：当 raw 事件落库失败、或 IssuesService upsert 失败时，将事件原文 + 失败原因入库，
// 由 Dashboard / alert 后续消费，避免数据静默丢失。
// 不分区：量级远低于主事件流（正常 < 1% 失败率），单表足够 12 个月。

export const CREATE_EVENTS_DLQ = `
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
`.trim();

export const CREATE_IDX_DLQ_PROJECT_CREATED = `
CREATE INDEX IF NOT EXISTS idx_dlq_project_created
  ON events_dlq (project_id, created_at DESC);
`.trim();

export const CREATE_IDX_DLQ_STAGE_CREATED = `
CREATE INDEX IF NOT EXISTS idx_dlq_stage_created
  ON events_dlq (stage, created_at DESC);
`.trim();

export const DLQ_DDL: readonly string[] = [
  CREATE_EVENTS_DLQ,
  CREATE_IDX_DLQ_PROJECT_CREATED,
  CREATE_IDX_DLQ_STAGE_CREATED,
];

// ============================================================
// 汇总
// ============================================================

/** 主表 DDL（严格 FK 顺序：users 先于 projects 先于其他）*/
export const MAIN_DDL: readonly string[] = [
  CREATE_USERS,
  CREATE_IDX_USERS_EMAIL,
  CREATE_PROJECTS,
  CREATE_IDX_PROJECTS_OWNER,
  CREATE_PROJECT_KEYS,
  CREATE_IDX_PROJECT_KEYS_PUBLIC,
  CREATE_IDX_PROJECT_KEYS_PROJECT,
  CREATE_PROJECT_MEMBERS,
  CREATE_IDX_MEMBERS_USER,
  CREATE_ENVIRONMENTS,
  CREATE_RELEASES,
  CREATE_IDX_RELEASES_PROJECT_CREATED,
  CREATE_ISSUES,
  CREATE_IDX_ISSUES_STATUS_LASTSEEN,
  CREATE_IDX_ISSUES_SUBTYPE_LASTSEEN,
];

export const PERFORMANCE_DDL: readonly string[] = [
  CREATE_PERF_EVENTS_RAW,
  CREATE_IDX_PERF_PROJECT_TS,
  CREATE_IDX_PERF_PROJECT_METRIC_TS,
  CREATE_IDX_PERF_PROJECT_PATH_TS,
];

export const ERROR_DDL: readonly string[] = [
  CREATE_ERROR_EVENTS_RAW,
  ALTER_ERROR_EVENTS_RAW_ADD_COLUMNS,
  CREATE_IDX_ERR_PROJECT_TS,
  CREATE_IDX_ERR_PROJECT_SUB_TS,
  CREATE_IDX_ERR_PROJECT_GROUP_TS,
  CREATE_IDX_ERR_PROJECT_KIND_TS,
];

/** events_raw 父表 + 4 张周分区 + 2 个索引（Gateway 暂不写入）*/
export const EVENTS_RAW_DDL: readonly string[] = [
  CREATE_EVENTS_RAW,
  CREATE_EVENTS_RAW_2026W17,
  CREATE_EVENTS_RAW_2026W18,
  CREATE_EVENTS_RAW_2026W19,
  CREATE_EVENTS_RAW_2026W20,
  CREATE_IDX_EVENTS_RAW_PROJECT_TYPE_INGESTED,
  CREATE_IDX_EVENTS_RAW_EVENT_ID,
];

/** 合并 DDL：DatabaseService.onModuleInit 按顺序执行 */
export const ALL_DDL: readonly string[] = [
  ...MAIN_DDL,
  ...PERFORMANCE_DDL,
  ...ERROR_DDL,
  ...API_DDL,
  ...EVENTS_RAW_DDL,
  ...DLQ_DDL,
];
