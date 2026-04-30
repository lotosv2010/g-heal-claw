import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { CustomLog } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import {
  customLogsRaw,
  type NewCustomLogRow,
} from "../../shared/database/schema.js";

export interface LogsWindowParams {
  readonly projectId: string;
  readonly sinceMs: number;
  readonly untilMs: number;
}

export interface LogsSummaryRow {
  readonly totalLogs: number;
  readonly errorCount: number;
  readonly warnCount: number;
  readonly infoCount: number;
  readonly errorRatio: number;
}

export interface LogLevelBucketRow {
  readonly level: "info" | "warn" | "error";
  readonly count: number;
}

export interface LogTrendRow {
  readonly hour: string;
  readonly info: number;
  readonly warn: number;
  readonly error: number;
}

export interface LogTopMessageRow {
  readonly level: "info" | "warn" | "error";
  readonly messageHead: string;
  readonly count: number;
  readonly lastSeenMs: number;
}

/** 3 级别固定顺序（info / warn / error） */
const FIXED_LEVELS: readonly ("info" | "warn" | "error")[] = [
  "info",
  "warn",
  "error",
];

/**
 * 自定义分级日志（type='custom_log'）落库 + 聚合服务（ADR-0023 §4）
 *
 * 聚合驱动 Dashboard `/dashboard/v1/logs/overview`：level 分桶 / 趋势三曲线 / Top message。
 */
@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  public constructor(private readonly database: DatabaseService) {}

  public async saveBatch(events: readonly CustomLog[]): Promise<number> {
    if (events.length === 0) return 0;
    const db = this.database.db;
    if (!db) return 0;
    const rows = events.map(toRow);
    try {
      const inserted = await db
        .insert(customLogsRaw)
        .values(rows)
        .onConflictDoNothing({ target: customLogsRaw.eventId })
        .returning({ id: customLogsRaw.id });
      return inserted.length;
    } catch (err) {
      this.logger.error(
        `custom_log 写入失败：${(err as Error).message}`,
        (err as Error).stack,
      );
      return 0;
    }
  }

  public async countForProject(projectId: string): Promise<number> {
    const db = this.database.db;
    if (!db) return 0;
    const result = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(customLogsRaw)
      .where(sql`${customLogsRaw.projectId} = ${projectId}`);
    return result[0]?.c ?? 0;
  }

  public async aggregateSummary(params: LogsWindowParams): Promise<LogsSummaryRow> {
    const db = this.database.db;
    const empty: LogsSummaryRow = {
      totalLogs: 0,
      errorCount: 0,
      warnCount: 0,
      infoCount: 0,
      errorRatio: 0,
    };
    if (!db) return empty;
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      total: string | number;
      errors: string | number;
      warns: string | number;
      infos: string | number;
    }>(sql`
      SELECT
        COUNT(*)                               AS total,
        COUNT(*) FILTER (WHERE level = 'error') AS errors,
        COUNT(*) FILTER (WHERE level = 'warn')  AS warns,
        COUNT(*) FILTER (WHERE level = 'info')  AS infos
      FROM custom_logs_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
    `);
    const first = rows[0];
    if (!first) return empty;
    const total = Number(first.total);
    const errors = Number(first.errors);
    return {
      totalLogs: total,
      errorCount: errors,
      warnCount: Number(first.warns),
      infoCount: Number(first.infos),
      errorRatio: total > 0 ? errors / total : 0,
    };
  }

  public async aggregateLevelBuckets(
    params: LogsWindowParams,
  ): Promise<LogLevelBucketRow[]> {
    const db = this.database.db;
    const defaults: LogLevelBucketRow[] = FIXED_LEVELS.map((l) => ({
      level: l,
      count: 0,
    }));
    if (!db) return defaults;
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{ level: string; n: string | number }>(sql`
      SELECT level, COUNT(*) AS n
      FROM custom_logs_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY level
    `);
    const lookup = new Map<string, number>();
    for (const r of rows) lookup.set(String(r.level), Number(r.n));
    return FIXED_LEVELS.map((l) => ({ level: l, count: lookup.get(l) ?? 0 }));
  }

  public async aggregateTrend(params: LogsWindowParams): Promise<LogTrendRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      hour: Date | string;
      info: string | number;
      warn: string | number;
      err: string | number;
    }>(sql`
      SELECT
        date_trunc('hour', to_timestamp(ts_ms / 1000.0)) AS hour,
        COUNT(*) FILTER (WHERE level = 'info')           AS info,
        COUNT(*) FILTER (WHERE level = 'warn')           AS warn,
        COUNT(*) FILTER (WHERE level = 'error')          AS err
      FROM custom_logs_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY hour
      ORDER BY hour ASC
    `);
    return rows.map((r) => ({
      hour:
        r.hour instanceof Date
          ? r.hour.toISOString()
          : new Date(String(r.hour)).toISOString(),
      info: Number(r.info),
      warn: Number(r.warn),
      error: Number(r.err),
    }));
  }

  public async aggregateTopMessages(
    params: LogsWindowParams,
    limit: number,
  ): Promise<LogTopMessageRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clamped = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await db.execute<{
      level: string;
      head: string;
      n: string | number;
      last: string | number | Date;
    }>(sql`
      SELECT level, message_head AS head, COUNT(*) AS n, MAX(ts_ms) AS last
      FROM custom_logs_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY level, message_head
      ORDER BY n DESC, head ASC
      LIMIT ${clamped}
    `);
    return rows.map((r) => ({
      level: normalizeLevel(String(r.level)),
      messageHead: String(r.head),
      count: Number(r.n),
      lastSeenMs: Number(r.last),
    }));
  }
}

function normalizeLevel(l: string): "info" | "warn" | "error" {
  if (l === "error" || l === "warn" || l === "info") return l;
  return "info";
}

function toRow(e: CustomLog): NewCustomLogRow {
  const message = e.message ?? "";
  return {
    eventId: e.eventId,
    projectId: e.projectId,
    publicKey: e.publicKey,
    sessionId: e.sessionId ?? "",
    tsMs: e.timestamp,
    level: e.level,
    message,
    messageHead: message.slice(0, 128),
    data: (e.data ?? null) as unknown as Record<string, unknown> | null,
    pageUrl: e.page?.url ?? "",
    pagePath: e.page?.path ?? "",
    ua: e.device?.ua,
    browser: e.device?.browser,
    os: e.device?.os,
    deviceType: e.device?.deviceType,
    release: e.release,
    environment: e.environment,
  };
}
