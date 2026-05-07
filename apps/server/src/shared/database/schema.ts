// Schema 桶式入口（ADR-0017 §4）
//
// 对外保持 `import * as schema from "./schema.js"` 兼容；业务代码按需从
// 本文件 re-export 获取所有表 + 类型。分业务域拆分见 ./schema/ 子目录。
//
// 表清单：
//   主表：users / projects / project_keys / project_members / environments / releases / issues
//   事件流：events_raw（父表，周分区）/ perf_events_raw / error_events_raw

export * from "./schema/users.js";
export * from "./schema/projects.js";
export * from "./schema/releases.js";
export * from "./schema/release-artifacts.js";
export * from "./schema/issues.js";
export * from "./schema/events-raw.js";
export * from "./schema/perf-events-raw.js";
export * from "./schema/error-events-raw.js";
export * from "./schema/api-events-raw.js";
export * from "./schema/track-events-raw.js";
export * from "./schema/resource-events-raw.js";
export * from "./schema/custom-events-raw.js";
export * from "./schema/custom-metrics-raw.js";
export * from "./schema/custom-logs-raw.js";
export * from "./schema/page-view-raw.js";
export * from "./schema/alert-rules.js";
export * from "./schema/alert-history.js";
export * from "./schema/channels.js";
export * from "./schema/heal-jobs.js";
export * from "./schema/metric-minute.js";
