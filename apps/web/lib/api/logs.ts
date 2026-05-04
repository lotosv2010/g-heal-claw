/**
 * 自定义日志大盘数据契约（对齐 ADR-0023 §4 / TM.1.C.5）
 *
 * Web 层消费 server `/dashboard/v1/logs/overview`。
 */

import type { OverviewSource } from "./performance";
import { buildServerHeaders } from "./server-fetch";

export type DeltaDirection = "up" | "down" | "flat";

export type LogLevel = "info" | "warn" | "error";

export interface LogsSummaryDelta {
  readonly totalLogs: number;
  readonly totalLogsDirection: DeltaDirection;
  readonly errorRatio: number;
  readonly errorRatioDirection: DeltaDirection;
}

export interface LogsSummary {
  readonly totalLogs: number;
  readonly infoCount: number;
  readonly warnCount: number;
  readonly errorCount: number;
  readonly errorRatio: number;
  readonly delta: LogsSummaryDelta;
}

export interface LogLevelBucket {
  readonly level: LogLevel;
  readonly count: number;
}

export interface LogTrendBucket {
  readonly hour: string;
  readonly info: number;
  readonly warn: number;
  readonly error: number;
}

export interface LogTopMessage {
  readonly level: LogLevel;
  readonly messageHead: string;
  readonly count: number;
  readonly lastSeenMs: number;
}

export interface LogsOverview {
  readonly summary: LogsSummary;
  readonly levelBuckets: readonly LogLevelBucket[];
  readonly trend: readonly LogTrendBucket[];
  readonly topMessages: readonly LogTopMessage[];
}

export interface LogsOverviewResult {
  readonly source: OverviewSource;
  readonly data: LogsOverview;
}

// ------- 常量 -------

export const LOG_LEVEL_ORDER: readonly LogLevel[] = ["info", "warn", "error"];

export const LOG_LEVEL_LABEL: Record<LogLevel, string> = {
  info: "Info",
  warn: "Warn",
  error: "Error",
};

export const LOG_LEVEL_TONE: Record<LogLevel, string> = {
  info: "text-sky-600",
  warn: "text-amber-600",
  error: "text-rose-600",
};

// ------- 数据获取 -------

export async function getLogsOverview(): Promise<LogsOverviewResult> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const projectId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "demo";
  const url = `${baseUrl}/dashboard/v1/logs/overview?projectId=${encodeURIComponent(
    projectId,
  )}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: buildServerHeaders(),
    });
    if (!response.ok) {
      console.error(
        `[logs-overview] ${response.status} ${response.statusText} @ ${url}`,
      );
      return { source: "error", data: emptyLogsOverview() };
    }
    const json = (await response.json()) as {
      data?: Partial<LogsOverview>;
    };
    const data = normalizeOverview(json.data);
    const hasSamples = data.summary.totalLogs > 0;
    return { source: hasSamples ? "live" : "empty", data };
  } catch (err) {
    console.error(
      `[logs-overview] fetch failed @ ${url} —`,
      (err as Error).message,
    );
    return { source: "error", data: emptyLogsOverview() };
  }
}

function normalizeOverview(
  raw: Partial<LogsOverview> | undefined,
): LogsOverview {
  const empty = emptyLogsOverview();
  if (!raw) return empty;
  return {
    summary: raw.summary ?? empty.summary,
    levelBuckets: raw.levelBuckets ?? empty.levelBuckets,
    trend: raw.trend ?? empty.trend,
    topMessages: raw.topMessages ?? empty.topMessages,
  };
}

export function emptyLogsOverview(): LogsOverview {
  return {
    summary: {
      totalLogs: 0,
      infoCount: 0,
      warnCount: 0,
      errorCount: 0,
      errorRatio: 0,
      delta: {
        totalLogs: 0,
        totalLogsDirection: "flat",
        errorRatio: 0,
        errorRatioDirection: "flat",
      },
    },
    levelBuckets: LOG_LEVEL_ORDER.map((level) => ({ level, count: 0 })),
    trend: [],
    topMessages: [],
  };
}
