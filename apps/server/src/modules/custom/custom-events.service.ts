import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { CustomEvent } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import {
  customEventsRaw,
  type NewCustomEventRow,
} from "../../shared/database/schema.js";

/** 查询窗口参数（与 ResourceMonitor / ApiMonitor 同构） */
export interface CustomWindowParams {
  readonly projectId: string;
  readonly sinceMs: number;
  readonly untilMs: number;
  readonly granularity?: "hour" | "day";
  readonly environment?: string;
}

export interface CustomEventsSummaryRow {
  readonly totalEvents: number;
  readonly distinctNames: number;
  readonly topEventName: string | null;
  readonly avgPerSession: number;
}

export interface CustomEventTopRow {
  readonly name: string;
  readonly count: number;
  readonly lastSeenMs: number;
}

export interface CustomEventTrendRow {
  readonly hour: string;
  readonly count: number;
}

export interface CustomEventTopPageRow {
  readonly pagePath: string;
  readonly count: number;
}

/**
 * 自定义业务事件（type='custom_event'）落库 + 聚合服务（ADR-0023 §4）
 *
 * 与 TrackingService（trackPlugin 被动 DOM 采集）完全独立；两者在 type 维度不重叠。
 */
@Injectable()
export class CustomEventsService {
  private readonly logger = new Logger(CustomEventsService.name);

  public constructor(private readonly database: DatabaseService) {}

  public async saveBatch(events: readonly CustomEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    const db = this.database.db;
    if (!db) return 0;
    const rows = events.map(toRow);
    try {
      const inserted = await db
        .insert(customEventsRaw)
        .values(rows)
        .onConflictDoNothing({ target: customEventsRaw.eventId })
        .returning({ id: customEventsRaw.id });
      return inserted.length;
    } catch (err) {
      this.logger.error(
        `custom_event 写入失败：${(err as Error).message}`,
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
      .from(customEventsRaw)
      .where(sql`${customEventsRaw.projectId} = ${projectId}`);
    return result[0]?.c ?? 0;
  }

  public async aggregateSummary(
    params: CustomWindowParams,
  ): Promise<CustomEventsSummaryRow> {
    const db = this.database.db;
    const empty: CustomEventsSummaryRow = {
      totalEvents: 0,
      distinctNames: 0,
      topEventName: null,
      avgPerSession: 0,
    };
    if (!db) return empty;
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      total: string | number;
      names: string | number;
      sessions: string | number;
      top: string | null;
    }>(sql`
      WITH base AS (
        SELECT name, session_id
        FROM custom_events_raw
        WHERE project_id = ${projectId}
          AND ts_ms >= ${sinceMs}
          AND ts_ms <  ${untilMs}
      ),
      top_name AS (
        SELECT name, COUNT(*) AS n
        FROM base
        GROUP BY name
        ORDER BY n DESC, name ASC
        LIMIT 1
      )
      SELECT
        (SELECT COUNT(*) FROM base)                              AS total,
        (SELECT COUNT(DISTINCT name) FROM base)                  AS names,
        (SELECT COUNT(DISTINCT session_id) FROM base)            AS sessions,
        (SELECT name FROM top_name)                              AS top
    `);
    const first = rows[0];
    if (!first) return empty;
    const total = Number(first.total);
    const sessions = Number(first.sessions);
    return {
      totalEvents: total,
      distinctNames: Number(first.names),
      topEventName: first.top == null ? null : String(first.top),
      avgPerSession: sessions > 0 ? total / sessions : 0,
    };
  }

  public async aggregateTopEvents(
    params: CustomWindowParams,
    limit: number,
  ): Promise<CustomEventTopRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clamped = clampLimit(limit);
    const rows = await db.execute<{
      name: string;
      n: string | number;
      last: string | number | Date;
    }>(sql`
      SELECT name, COUNT(*) AS n, MAX(ts_ms) AS last
      FROM custom_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY name
      ORDER BY n DESC, name ASC
      LIMIT ${clamped}
    `);
    return rows.map((r) => ({
      name: String(r.name),
      count: Number(r.n),
      lastSeenMs: Number(r.last),
    }));
  }

  public async aggregateTrend(
    params: CustomWindowParams,
  ): Promise<CustomEventTrendRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const trunc = params.granularity === "day"
      ? sql`date_trunc('day', to_timestamp(ts_ms / 1000.0))`
      : sql`date_trunc('hour', to_timestamp(ts_ms / 1000.0))`;
    const rows = await db.execute<{
      hour: Date | string;
      n: string | number;
    }>(sql`
      SELECT
        ${trunc} AS hour,
        COUNT(*)                                         AS n
      FROM custom_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
        ${params.environment ? sql`AND environment = ${params.environment}` : sql``}
      GROUP BY hour
      ORDER BY hour ASC
    `);
    return rows.map((r) => ({
      hour:
        r.hour instanceof Date
          ? r.hour.toISOString()
          : new Date(String(r.hour)).toISOString(),
      count: Number(r.n),
    }));
  }

  public async aggregateTopPages(
    params: CustomWindowParams,
    limit: number,
  ): Promise<CustomEventTopPageRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clamped = clampLimit(limit);
    const rows = await db.execute<{
      path: string;
      n: string | number;
    }>(sql`
      SELECT page_path AS path, COUNT(*) AS n
      FROM custom_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
        AND page_path <> ''
      GROUP BY page_path
      ORDER BY n DESC, path ASC
      LIMIT ${clamped}
    `);
    return rows.map((r) => ({
      pagePath: String(r.path),
      count: Number(r.n),
    }));
  }
}

function clampLimit(limit: number): number {
  return Math.max(1, Math.min(100, Math.floor(limit)));
}

function toRow(e: CustomEvent): NewCustomEventRow {
  return {
    eventId: e.eventId,
    projectId: e.projectId,
    publicKey: e.publicKey,
    sessionId: e.sessionId ?? "",
    tsMs: e.timestamp,
    name: (e.name ?? "").slice(0, 128),
    properties: (e.properties ?? {}) as Record<string, unknown>,
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
