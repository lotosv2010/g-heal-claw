import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { ErrorEvent } from "@g-heal-claw/shared";
import { DatabaseService } from "../shared/database/database.service.js";
import {
  errorEventsRaw,
  type NewErrorEventRow,
} from "../shared/database/schema.js";

/** 窗口参数（与 PerformanceService 同构） */
export interface ErrorWindowParams {
  readonly projectId: string;
  readonly sinceMs: number;
  readonly untilMs: number;
}

/** 聚合：总事件数 + 影响会话数 */
export interface ErrorSummaryRow {
  readonly totalEvents: number;
  readonly impactedSessions: number;
}

/** 聚合：按 sub_type 计数 */
export interface SubTypeCountRow {
  readonly subType: string;
  readonly count: number;
}

/** 聚合：每小时桶 × sub_type */
export interface TrendRow {
  readonly hour: string;
  readonly subType: string;
  readonly count: number;
}

/** 聚合：Top 分组（sub_type × message_head） */
export interface TopGroupRow {
  readonly subType: string;
  readonly messageHead: string;
  readonly count: number;
  readonly impactedSessions: number;
  readonly firstSeenMs: number;
  readonly lastSeenMs: number;
  readonly samplePath: string;
}

const MESSAGE_HEAD_MAX = 128;

/**
 * 异常事件落库 + 聚合服务（ADR-0016 §2 / §3）
 *
 * 写入路径：
 * - event_id UNIQUE + ON CONFLICT DO NOTHING 幂等
 * - test 环境（db=null）短路返回 0，不阻塞 HTTP
 *
 * 查询路径：全部使用 `percentile` 外的原生 SQL；依赖 3 个 idx_err_* 索引。
 */
@Injectable()
export class ErrorsService {
  private readonly logger = new Logger(ErrorsService.name);

  public constructor(private readonly database: DatabaseService) {}

  /**
   * 批量写入错误事件
   *
   * 返回实际插入行数（幂等冲突不计入）
   */
  public async saveBatch(events: readonly ErrorEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    const db = this.database.db;
    if (!db) return 0;
    const rows = events.map(toRow);
    try {
      const inserted = await db
        .insert(errorEventsRaw)
        .values(rows)
        .onConflictDoNothing({ target: errorEventsRaw.eventId })
        .returning({ id: errorEventsRaw.id });
      return inserted.length;
    } catch (err) {
      this.logger.error(
        `错误事件写入失败：${(err as Error).message}`,
        (err as Error).stack,
      );
      return 0;
    }
  }

  /** 调试用：窗口计数（Dashboard 不使用，保留给端到端验证） */
  public async countForProject(projectId: string): Promise<number> {
    const db = this.database.db;
    if (!db) return 0;
    const result = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(errorEventsRaw)
      .where(sql`${errorEventsRaw.projectId} = ${projectId}`);
    return result[0]?.c ?? 0;
  }

  public async aggregateSummary(
    params: ErrorWindowParams,
  ): Promise<ErrorSummaryRow> {
    const db = this.database.db;
    if (!db) return { totalEvents: 0, impactedSessions: 0 };
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      total: string | number;
      sessions: string | number;
    }>(sql`
      SELECT
        COUNT(*)                       AS total,
        COUNT(DISTINCT session_id)     AS sessions
      FROM error_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
    `);
    const first = rows[0];
    return {
      totalEvents: first ? Number(first.total) : 0,
      impactedSessions: first ? Number(first.sessions) : 0,
    };
  }

  public async aggregateBySubType(
    params: ErrorWindowParams,
  ): Promise<SubTypeCountRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      sub_type: string;
      n: string | number;
    }>(sql`
      SELECT
        sub_type,
        COUNT(*) AS n
      FROM error_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY sub_type
      ORDER BY n DESC
    `);
    return rows.map((r) => ({
      subType: String(r.sub_type),
      count: Number(r.n),
    }));
  }

  public async aggregateTrend(params: ErrorWindowParams): Promise<TrendRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      hour: Date | string;
      sub_type: string;
      n: string | number;
    }>(sql`
      SELECT
        date_trunc('hour', to_timestamp(ts_ms / 1000.0)) AS hour,
        sub_type,
        COUNT(*) AS n
      FROM error_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY hour, sub_type
      ORDER BY hour ASC
    `);
    return rows.map((r) => ({
      hour:
        r.hour instanceof Date
          ? r.hour.toISOString()
          : new Date(String(r.hour)).toISOString(),
      subType: String(r.sub_type),
      count: Number(r.n),
    }));
  }

  public async aggregateTopGroups(
    params: ErrorWindowParams,
    limit: number,
  ): Promise<TopGroupRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      sub_type: string;
      message_head: string;
      n: string | number;
      sessions: string | number;
      first_ms: string | number;
      last_ms: string | number;
      sample_path: string;
    }>(sql`
      SELECT
        sub_type,
        message_head,
        COUNT(*)                    AS n,
        COUNT(DISTINCT session_id)  AS sessions,
        MIN(ts_ms)                  AS first_ms,
        MAX(ts_ms)                  AS last_ms,
        (ARRAY_AGG(path ORDER BY ts_ms DESC))[1] AS sample_path
      FROM error_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY sub_type, message_head
      ORDER BY n DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      subType: String(r.sub_type),
      messageHead: String(r.message_head),
      count: Number(r.n),
      impactedSessions: Number(r.sessions),
      firstSeenMs: Number(r.first_ms),
      lastSeenMs: Number(r.last_ms),
      samplePath: String(r.sample_path ?? ""),
    }));
  }
}

function toRow(event: ErrorEvent): NewErrorEventRow {
  const messageHead = (event.message ?? "").slice(0, MESSAGE_HEAD_MAX);
  return {
    eventId: event.eventId,
    projectId: event.projectId,
    publicKey: event.publicKey,
    sessionId: event.sessionId,
    tsMs: event.timestamp,
    subType: event.subType,
    message: event.message ?? "",
    messageHead,
    stack: event.stack ?? null,
    frames: event.frames ?? null,
    componentStack: event.componentStack ?? null,
    resource: event.resource ?? null,
    breadcrumbs: event.breadcrumbs ?? null,
    url: event.page.url,
    path: event.page.path,
    ua: event.device.ua,
    browser: event.device.browser,
    os: event.device.os,
    deviceType: event.device.deviceType,
    release: event.release,
    environment: event.environment,
  };
}
