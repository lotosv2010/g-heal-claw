import { Injectable } from "@nestjs/common";
import {
  LogsService,
  type LogLevelBucketRow,
  type LogsSummaryRow,
  type LogsWindowParams,
  type LogTopMessageRow,
  type LogTrendRow,
} from "../../modules/logs/logs.service.js";
import type {
  DeltaDirection,
  LogLevel,
  LogLevelBucketDto,
  LogsOverviewDto,
  LogsOverviewQuery,
  LogsSummaryDeltaDto,
  LogsSummaryDto,
  LogTopMessageDto,
  LogTrendBucketDto,
} from "../dto/logs-overview.dto.js";

/**
 * Dashboard Logs 大盘装配层（ADR-0023 §4 / TM.1.C.4）
 *
 * 两次窗口聚合 summary → 错误率环比（绝对差 pp）；
 * levelBuckets 透传（LogsService 已保证 3 级别固定占位）；trend / topMessages 透传。
 */
@Injectable()
export class DashboardLogsService {
  public constructor(private readonly logs: LogsService) {}

  public async getOverview(
    query: LogsOverviewQuery,
  ): Promise<LogsOverviewDto> {
    const { projectId, windowHours, limitMessages } = query;
    const now = Date.now();
    const windowMs = windowHours * 3600_000;

    const granularity = windowHours > 24 ? "day" as const : "hour" as const;
    const environment = query.environment;
    const current: LogsWindowParams = {
      projectId,
      sinceMs: now - windowMs,
      untilMs: now,
      granularity,
      environment,
    };
    const previous: LogsWindowParams = {
      projectId,
      sinceMs: now - 2 * windowMs,
      untilMs: now - windowMs,
      granularity,
      environment,
    };

    const [summaryCur, summaryPrev, levelBuckets, trend, topMessages] =
      await Promise.all([
        this.logs.aggregateSummary(current),
        this.logs.aggregateSummary(previous),
        this.logs.aggregateLevelBuckets(current),
        this.logs.aggregateTrend(current),
        this.logs.aggregateTopMessages(current, limitMessages),
      ]);

    return {
      summary: buildSummary(summaryCur, summaryPrev),
      levelBuckets: buildLevelBuckets(levelBuckets),
      trend: buildTrend(trend),
      topMessages: buildTopMessages(topMessages),
    };
  }
}

function buildSummary(
  current: LogsSummaryRow,
  previous: LogsSummaryRow,
): LogsSummaryDto {
  return {
    totalLogs: current.totalLogs,
    infoCount: current.infoCount,
    warnCount: current.warnCount,
    errorCount: current.errorCount,
    errorRatio: round4(current.errorRatio),
    delta: buildDelta(current, previous),
  };
}

function buildDelta(
  current: LogsSummaryRow,
  previous: LogsSummaryRow,
): LogsSummaryDeltaDto {
  const totalDelta = computePercentDelta(
    current.totalLogs,
    previous.totalLogs,
  );
  const errorDelta = computeRatioDelta(current.errorRatio, previous.errorRatio);
  return {
    totalLogs: totalDelta.deltaPercent,
    totalLogsDirection: totalDelta.deltaDirection,
    errorRatio: errorDelta.deltaValue,
    errorRatioDirection: errorDelta.deltaDirection,
  };
}

function computePercentDelta(
  current: number,
  previous: number,
): { deltaPercent: number; deltaDirection: DeltaDirection } {
  if (previous === 0 || current === 0) {
    return { deltaPercent: 0, deltaDirection: "flat" };
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (Math.abs(rounded) < 0.1) {
    return { deltaPercent: 0, deltaDirection: "flat" };
  }
  return {
    deltaPercent: Math.abs(rounded),
    deltaDirection: rounded > 0 ? "up" : "down",
  };
}

function computeRatioDelta(
  current: number,
  previous: number,
): { deltaValue: number; deltaDirection: DeltaDirection } {
  const diff = current - previous;
  const rounded = round4(Math.abs(diff));
  if (rounded < 0.0001) {
    return { deltaValue: 0, deltaDirection: "flat" };
  }
  return {
    deltaValue: rounded,
    deltaDirection: diff > 0 ? "up" : "down",
  };
}

function buildLevelBuckets(
  rows: readonly LogLevelBucketRow[],
): LogLevelBucketDto[] {
  return rows.map((r) => ({ level: r.level as LogLevel, count: r.count }));
}

function buildTrend(rows: readonly LogTrendRow[]): LogTrendBucketDto[] {
  return rows.map((r) => ({
    hour: r.hour,
    info: r.info,
    warn: r.warn,
    error: r.error,
  }));
}

function buildTopMessages(
  rows: readonly LogTopMessageRow[],
): LogTopMessageDto[] {
  return rows.map((r) => ({
    level: r.level as LogLevel,
    messageHead: r.messageHead,
    count: r.count,
    lastSeenMs: r.lastSeenMs,
  }));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
