/**
 * 性能切片 DDL（ADR-0013）
 *
 * 原始 SQL 字符串；启动期在 DatabaseService.onModuleInit 中幂等执行。
 * T1.1.5 引入 drizzle-kit 后，本文件将被自动生成的迁移替代。
 */
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

export const PERFORMANCE_DDL: readonly string[] = [
  CREATE_PERF_EVENTS_RAW,
  CREATE_IDX_PERF_PROJECT_TS,
  CREATE_IDX_PERF_PROJECT_METRIC_TS,
  CREATE_IDX_PERF_PROJECT_PATH_TS,
];

/**
 * 异常事件切片 DDL（ADR-0016 §2）
 *
 * MVP：单表承载所有 error 事件；不做指纹聚合（T1.4.2）。
 * message_head 作为 UI 分组键的一部分，额外索引覆盖 topGroups 查询。
 */
export const CREATE_ERROR_EVENTS_RAW = `
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

export const ERROR_DDL: readonly string[] = [
  CREATE_ERROR_EVENTS_RAW,
  CREATE_IDX_ERR_PROJECT_TS,
  CREATE_IDX_ERR_PROJECT_SUB_TS,
  CREATE_IDX_ERR_PROJECT_GROUP_TS,
];

/** 合并 DDL：DatabaseService.onModuleInit 按顺序执行 */
export const ALL_DDL: readonly string[] = [
  ...PERFORMANCE_DDL,
  ...ERROR_DDL,
];
