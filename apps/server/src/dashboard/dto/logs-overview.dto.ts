import { z } from "zod";

/**
 * Dashboard Logs 大盘契约（ADR-0023 §4 / TM.1.C.4）
 *
 * 数据源：`custom_logs_raw`（customPlugin 主动 log）；与 errors 模块（被动捕获）互补。
 *
 * 字段组成：
 *  - summary：日志总数 / 三级别计数 / errorRatio + 环比（错误率绝对值差 pp）
 *  - levelBuckets：info / warn / error 三级别固定占位
 *  - trend：按小时三折线
 *  - topMessages：按 (level, messageHead) 分组 Top N
 */

// ------- 请求 query -------

export const LogsOverviewQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  /** 聚合窗口（小时），默认 24，最大 168（7d） */
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
  /** topMessages 条数，默认 10，最大 50 */
  limitMessages: z.coerce.number().int().min(1).max(50).default(10),
});
export type LogsOverviewQuery = z.infer<typeof LogsOverviewQuerySchema>;

// ------- 响应 DTO -------

export type DeltaDirection = "up" | "down" | "flat";

export type LogLevel = "info" | "warn" | "error";

export interface LogsSummaryDeltaDto {
  /** 总数环比：|%|，保留 1 位小数 */
  readonly totalLogs: number;
  readonly totalLogsDirection: DeltaDirection;
  /** 错误率差：当前 errorRatio - 上一窗口 errorRatio（绝对值，0~1，保留 4 位小数） */
  readonly errorRatio: number;
  readonly errorRatioDirection: DeltaDirection;
}

export interface LogsSummaryDto {
  readonly totalLogs: number;
  readonly infoCount: number;
  readonly warnCount: number;
  readonly errorCount: number;
  /** 错误占比（0~1，保留 4 位小数） */
  readonly errorRatio: number;
  readonly delta: LogsSummaryDeltaDto;
}

export interface LogLevelBucketDto {
  readonly level: LogLevel;
  readonly count: number;
}

export interface LogTrendBucketDto {
  readonly hour: string;
  readonly info: number;
  readonly warn: number;
  readonly error: number;
}

export interface LogTopMessageDto {
  readonly level: LogLevel;
  readonly messageHead: string;
  readonly count: number;
  readonly lastSeenMs: number;
}

export interface LogsOverviewDto {
  readonly summary: LogsSummaryDto;
  /** 固定 3 级别占位，顺序：info → warn → error */
  readonly levelBuckets: readonly LogLevelBucketDto[];
  readonly trend: readonly LogTrendBucketDto[];
  readonly topMessages: readonly LogTopMessageDto[];
}
