import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { TrackEvent } from "@g-heal-claw/shared";
import { DatabaseService } from "../shared/database/database.service.js";
import {
  trackEventsRaw,
  type NewTrackEventRow,
} from "../shared/database/schema.js";

/** 聚合：窗口参数（与 ApiMonitorService 同构） */
export interface TrackWindowParams {
  readonly projectId: string;
  readonly sinceMs: number;
  readonly untilMs: number;
}

/** 聚合：总览 */
export interface TrackSummaryRow {
  readonly totalEvents: number;
  readonly uniqueUsers: number;
  readonly uniqueSessions: number;
  readonly uniqueEventNames: number;
}

/** 聚合：按类型分桶 */
export interface TrackTypeBucketRow {
  /** code / click / expose / submit */
  readonly bucket: string;
  readonly count: number;
}

/** 聚合：每小时桶 */
export interface TrackTrendRow {
  readonly hour: string;
  readonly count: number;
  readonly uniqueUsers: number;
}

/** 聚合：Top 事件名 */
export interface TopEventRow {
  readonly eventName: string;
  readonly trackType: string;
  readonly count: number;
  readonly uniqueUsers: number;
  readonly sharePercent: number;
}

/** 聚合：Top 页面 */
export interface TopTrackPageRow {
  readonly pagePath: string;
  readonly count: number;
  readonly uniqueUsers: number;
}

/** 曝光总览（仅 track_type='expose'） */
export interface ExposureSummaryRow {
  readonly totalExposures: number;
  readonly uniqueSelectors: number;
  readonly uniquePages: number;
  readonly uniqueUsers: number;
}

/** 曝光：Top 元素（按 selector / eventName 聚合） */
export interface TopExposureSelectorRow {
  readonly selector: string;
  readonly sampleText: string | null;
  readonly count: number;
  readonly uniqueUsers: number;
  readonly uniquePages: number;
  readonly sharePercent: number;
}

/**
 * 埋点事件落库 + 聚合服务（P0-3 §2）
 *
 * 职责：
 *  - `saveBatch`：trackPlugin 批量明细 → `track_events_raw`，`event_id UNIQUE` 幂等
 *  - `aggregate*`：Dashboard `/dashboard/v1/tracking/overview` 聚合驱动
 *
 * 与 ApiMonitorService 镜像实现：小时桶用 `date_trunc('hour')`，
 * 占比用子查询总数避免重复扫描。
 */
@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  public constructor(private readonly database: DatabaseService) {}

  public async saveBatch(events: readonly TrackEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    const db = this.database.db;
    if (!db) return 0;
    const rows = events.map(toRow);
    try {
      const inserted = await db
        .insert(trackEventsRaw)
        .values(rows)
        .onConflictDoNothing({ target: trackEventsRaw.eventId })
        .returning({ id: trackEventsRaw.id });
      return inserted.length;
    } catch (err) {
      this.logger.error(
        `埋点事件写入失败：${(err as Error).message}`,
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
      .from(trackEventsRaw)
      .where(sql`${trackEventsRaw.projectId} = ${projectId}`);
    return result[0]?.c ?? 0;
  }

  /** 窗口总览：总事件 / 去重用户 / 去重 session / 去重事件名 */
  public async aggregateSummary(
    params: TrackWindowParams,
  ): Promise<TrackSummaryRow> {
    const db = this.database.db;
    if (!db) {
      return {
        totalEvents: 0,
        uniqueUsers: 0,
        uniqueSessions: 0,
        uniqueEventNames: 0,
      };
    }
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      total: string | number;
      users: string | number;
      sessions: string | number;
      names: string | number;
    }>(sql`
      SELECT
        COUNT(*)                                         AS total,
        COUNT(DISTINCT COALESCE(user_id, session_id))    AS users,
        COUNT(DISTINCT session_id)                       AS sessions,
        COUNT(DISTINCT event_name)                       AS names
      FROM track_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
    `);
    const first = rows[0];
    if (!first) {
      return {
        totalEvents: 0,
        uniqueUsers: 0,
        uniqueSessions: 0,
        uniqueEventNames: 0,
      };
    }
    return {
      totalEvents: Number(first.total),
      uniqueUsers: Number(first.users),
      uniqueSessions: Number(first.sessions),
      uniqueEventNames: Number(first.names),
    };
  }

  /** 按类型分桶：code / click / expose / submit */
  public async aggregateTypeBuckets(
    params: TrackWindowParams,
  ): Promise<TrackTypeBucketRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      bucket: string;
      n: string | number;
    }>(sql`
      SELECT
        track_type   AS bucket,
        COUNT(*)     AS n
      FROM track_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY track_type
      ORDER BY bucket ASC
    `);
    return rows.map((r) => ({
      bucket: String(r.bucket),
      count: Number(r.n),
    }));
  }

  /** 每小时事件量 + 去重用户 */
  public async aggregateTrend(
    params: TrackWindowParams,
  ): Promise<TrackTrendRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      hour: Date | string;
      n: string | number;
      users: string | number;
    }>(sql`
      SELECT
        date_trunc('hour', to_timestamp(ts_ms / 1000.0))     AS hour,
        COUNT(*)                                              AS n,
        COUNT(DISTINCT COALESCE(user_id, session_id))         AS users
      FROM track_events_raw
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
      count: Number(r.n),
      uniqueUsers: Number(r.users),
    }));
  }

  /** Top 事件（按 event_name + track_type 聚合，按次数倒序） */
  public async aggregateTopEvents(
    params: TrackWindowParams,
    limit: number,
  ): Promise<TopEventRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await db.execute<{
      event_name: string;
      track_type: string;
      n: string | number;
      users: string | number;
      total: string | number;
    }>(sql`
      WITH scoped AS (
        SELECT event_name, track_type, user_id, session_id
        FROM track_events_raw
        WHERE project_id = ${projectId}
          AND ts_ms >= ${sinceMs}
          AND ts_ms <  ${untilMs}
      )
      SELECT
        event_name,
        track_type,
        COUNT(*)                                          AS n,
        COUNT(DISTINCT COALESCE(user_id, session_id))     AS users,
        (SELECT COUNT(*) FROM scoped)                     AS total
      FROM scoped
      GROUP BY event_name, track_type
      ORDER BY n DESC
      LIMIT ${clampedLimit}
    `);
    return rows.map((r) => {
      const count = Number(r.n);
      const total = Number(r.total);
      return {
        eventName: String(r.event_name),
        trackType: String(r.track_type),
        count,
        uniqueUsers: Number(r.users),
        sharePercent: total > 0 ? (count / total) * 100 : 0,
      };
    });
  }

  /** Top 页面（按 page_path） */
  public async aggregateTopPages(
    params: TrackWindowParams,
    limit: number,
  ): Promise<TopTrackPageRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await db.execute<{
      page_path: string;
      n: string | number;
      users: string | number;
    }>(sql`
      SELECT
        page_path,
        COUNT(*)                                          AS n,
        COUNT(DISTINCT COALESCE(user_id, session_id))     AS users
      FROM track_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
        AND page_path <> ''
      GROUP BY page_path
      ORDER BY n DESC
      LIMIT ${clampedLimit}
    `);
    return rows.map((r) => ({
      pagePath: String(r.page_path),
      count: Number(r.n),
      uniqueUsers: Number(r.users),
    }));
  }

  /** 曝光窗口总览：总曝光 / 去重元素 / 去重页面 / 去重用户 */
  public async aggregateExposureSummary(
    params: TrackWindowParams,
  ): Promise<ExposureSummaryRow> {
    const db = this.database.db;
    if (!db) {
      return {
        totalExposures: 0,
        uniqueSelectors: 0,
        uniquePages: 0,
        uniqueUsers: 0,
      };
    }
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      total: string | number;
      selectors: string | number;
      pages: string | number;
      users: string | number;
    }>(sql`
      SELECT
        COUNT(*)                                                AS total,
        COUNT(DISTINCT COALESCE(target_selector, event_name))   AS selectors,
        COUNT(DISTINCT page_path)                               AS pages,
        COUNT(DISTINCT COALESCE(user_id, session_id))           AS users
      FROM track_events_raw
      WHERE project_id = ${projectId}
        AND track_type = 'expose'
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
    `);
    const first = rows[0];
    if (!first) {
      return {
        totalExposures: 0,
        uniqueSelectors: 0,
        uniquePages: 0,
        uniqueUsers: 0,
      };
    }
    return {
      totalExposures: Number(first.total),
      uniqueSelectors: Number(first.selectors),
      uniquePages: Number(first.pages),
      uniqueUsers: Number(first.users),
    };
  }

  /** 曝光按小时：曝光量 + 去重用户（仅 expose） */
  public async aggregateExposureTrend(
    params: TrackWindowParams,
  ): Promise<TrackTrendRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      hour: Date | string;
      n: string | number;
      users: string | number;
    }>(sql`
      SELECT
        date_trunc('hour', to_timestamp(ts_ms / 1000.0))     AS hour,
        COUNT(*)                                              AS n,
        COUNT(DISTINCT COALESCE(user_id, session_id))         AS users
      FROM track_events_raw
      WHERE project_id = ${projectId}
        AND track_type = 'expose'
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
      count: Number(r.n),
      uniqueUsers: Number(r.users),
    }));
  }

  /** 曝光 Top 元素（按 selector 回落 event_name） */
  public async aggregateTopExposureSelectors(
    params: TrackWindowParams,
    limit: number,
  ): Promise<TopExposureSelectorRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await db.execute<{
      selector: string;
      sample_text: string | null;
      n: string | number;
      users: string | number;
      pages: string | number;
      total: string | number;
    }>(sql`
      WITH scoped AS (
        SELECT
          COALESCE(target_selector, event_name) AS selector,
          target_text,
          user_id,
          session_id,
          page_path
        FROM track_events_raw
        WHERE project_id = ${projectId}
          AND track_type = 'expose'
          AND ts_ms >= ${sinceMs}
          AND ts_ms <  ${untilMs}
      )
      SELECT
        selector,
        MAX(target_text)                                  AS sample_text,
        COUNT(*)                                          AS n,
        COUNT(DISTINCT COALESCE(user_id, session_id))     AS users,
        COUNT(DISTINCT page_path)                         AS pages,
        (SELECT COUNT(*) FROM scoped)                     AS total
      FROM scoped
      WHERE selector IS NOT NULL AND selector <> ''
      GROUP BY selector
      ORDER BY n DESC
      LIMIT ${clampedLimit}
    `);
    return rows.map((r) => {
      const count = Number(r.n);
      const total = Number(r.total);
      return {
        selector: String(r.selector),
        sampleText: r.sample_text ?? null,
        count,
        uniqueUsers: Number(r.users),
        uniquePages: Number(r.pages),
        sharePercent: total > 0 ? (count / total) * 100 : 0,
      };
    });
  }

  /** 曝光 Top 页面（仅 expose） */
  public async aggregateTopExposurePages(
    params: TrackWindowParams,
    limit: number,
  ): Promise<TopTrackPageRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await db.execute<{
      page_path: string;
      n: string | number;
      users: string | number;
    }>(sql`
      SELECT
        page_path,
        COUNT(*)                                          AS n,
        COUNT(DISTINCT COALESCE(user_id, session_id))     AS users
      FROM track_events_raw
      WHERE project_id = ${projectId}
        AND track_type = 'expose'
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
        AND page_path <> ''
      GROUP BY page_path
      ORDER BY n DESC
      LIMIT ${clampedLimit}
    `);
    return rows.map((r) => ({
      pagePath: String(r.page_path),
      count: Number(r.n),
      uniqueUsers: Number(r.users),
    }));
  }
}

/** TrackEvent → track_events_raw 行映射 */
function toRow(e: TrackEvent): NewTrackEventRow {
  const eventName = deriveEventName(e);
  const props = e.properties ?? {};
  return {
    eventId: e.eventId,
    projectId: e.projectId,
    publicKey: e.publicKey,
    sessionId: e.sessionId ?? "",
    tsMs: e.timestamp,
    trackType: e.trackType,
    eventName: eventName.slice(0, 128),
    targetTag: e.target?.tag?.slice(0, 32),
    targetId: e.target?.id?.slice(0, 128),
    targetClass: e.target?.className,
    targetSelector: e.target?.selector,
    targetText: e.target?.text?.slice(0, 200),
    properties: props as Record<string, unknown>,
    userId: e.user?.id?.slice(0, 64),
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

/**
 * 事件名推导：
 *  - code 埋点：properties.__name 优先；否则回落 target.selector / 'anonymous'
 *  - 自动埋点：data-track（selector）> id > tag > 'unknown'
 */
function deriveEventName(e: TrackEvent): string {
  const props = (e.properties ?? {}) as Record<string, unknown>;
  const codeName = typeof props.__name === "string" ? props.__name : undefined;
  if (e.trackType === "code" && codeName) return codeName;
  const sel = e.target?.selector;
  if (sel) return sel;
  if (e.target?.id) return `#${e.target.id}`;
  if (e.target?.tag) return e.target.tag;
  return "unknown";
}
