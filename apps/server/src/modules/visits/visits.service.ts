import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { PageViewEvent } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import {
  pageViewRaw,
  type NewPageViewRow,
} from "../../shared/database/schema.js";

/** 聚合：窗口参数（与 ApiService / ErrorsService 同构） */
export interface VisitsWindowParams {
  readonly projectId: string;
  readonly sinceMs: number;
  readonly untilMs: number;
}

/** 聚合：总览 PV / UV / 硬刷新占比 */
export interface VisitsSummaryRow {
  readonly pv: number;
  readonly uv: number;
  readonly spaNavCount: number;
  readonly reloadCount: number;
}

/** 聚合：每小时桶（PV + UV） */
export interface VisitsTrendRow {
  readonly hour: string;
  readonly pv: number;
  readonly uv: number;
}

/** 聚合：TopPages（按 path） */
export interface TopPageRow {
  readonly path: string;
  readonly pv: number;
  readonly uv: number;
  readonly sharePercent: number;
}

/** 聚合：TopReferrers（按 referrer_host，空值归 "direct"） */
export interface TopReferrerRow {
  readonly referrerHost: string;
  readonly pv: number;
  readonly sharePercent: number;
}

/**
 * 页面访问事件落库 + 聚合服务（ADR-0020 Tier 2.A）
 *
 * 职责：
 *  - `saveBatch`：pageViewPlugin 批量明细 → `page_view_raw`，`event_id UNIQUE` 幂等
 *  - `aggregate*`：Dashboard `/dashboard/v1/visits/overview` 聚合驱动
 *
 * 与 TrackingService 的分工：
 *  - TrackingService：click / submit / expose / code 交互埋点（track_events_raw）
 *  - VisitsService：页面进入独立流（page_view_raw）
 */
@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  public constructor(private readonly database: DatabaseService) {}

  public async saveBatch(events: readonly PageViewEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    const db = this.database.db;
    if (!db) return 0;
    const rows = events.map(toRow);
    try {
      const inserted = await db
        .insert(pageViewRaw)
        .values(rows)
        .onConflictDoNothing({ target: pageViewRaw.eventId })
        .returning({ id: pageViewRaw.id });
      return inserted.length;
    } catch (err) {
      this.logger.error(
        `PageView 事件写入失败：${(err as Error).message}`,
        (err as Error).stack,
      );
      return 0;
    }
  }

  /** 调试 / 端到端验证用：简单总数查询 */
  public async countForProject(projectId: string): Promise<number> {
    const db = this.database.db;
    if (!db) return 0;
    const result = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(pageViewRaw)
      .where(sql`${pageViewRaw.projectId} = ${projectId}`);
    return result[0]?.c ?? 0;
  }

  /** 窗口总览：PV / UV（DISTINCT session_id） / SPA 占比 / 刷新占比 */
  public async aggregateSummary(
    params: VisitsWindowParams,
  ): Promise<VisitsSummaryRow> {
    const db = this.database.db;
    if (!db) return { pv: 0, uv: 0, spaNavCount: 0, reloadCount: 0 };
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      pv: string | number;
      uv: string | number;
      spa: string | number;
      reload: string | number;
    }>(sql`
      SELECT
        COUNT(*)                                                 AS pv,
        COUNT(DISTINCT session_id)                               AS uv,
        COUNT(*) FILTER (WHERE is_spa_nav = true)                AS spa,
        COUNT(*) FILTER (WHERE load_type = 'reload')             AS reload
      FROM page_view_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
    `);
    const first = rows[0];
    if (!first) return { pv: 0, uv: 0, spaNavCount: 0, reloadCount: 0 };
    return {
      pv: Number(first.pv),
      uv: Number(first.uv),
      spaNavCount: Number(first.spa),
      reloadCount: Number(first.reload),
    };
  }

  /** 每小时 PV / UV 趋势 */
  public async aggregateTrend(
    params: VisitsWindowParams,
  ): Promise<VisitsTrendRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      hour: Date | string;
      pv: string | number;
      uv: string | number;
    }>(sql`
      SELECT
        date_trunc('hour', to_timestamp(ts_ms / 1000.0))  AS hour,
        COUNT(*)                                          AS pv,
        COUNT(DISTINCT session_id)                        AS uv
      FROM page_view_raw
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
      pv: Number(r.pv),
      uv: Number(r.uv),
    }));
  }

  /** TopPages：按 path 聚合 PV + UV + 占比 */
  public async aggregateTopPages(
    params: VisitsWindowParams,
    limit: number,
  ): Promise<TopPageRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await db.execute<{
      path: string;
      pv: string | number;
      uv: string | number;
      total: string | number;
    }>(sql`
      WITH scoped AS (
        SELECT path, session_id
        FROM page_view_raw
        WHERE project_id = ${projectId}
          AND ts_ms >= ${sinceMs}
          AND ts_ms <  ${untilMs}
      )
      SELECT
        path,
        COUNT(*)                                    AS pv,
        COUNT(DISTINCT session_id)                  AS uv,
        (SELECT COUNT(*) FROM scoped)               AS total
      FROM scoped
      GROUP BY path
      ORDER BY pv DESC
      LIMIT ${clampedLimit}
    `);
    return rows.map((r) => {
      const pv = Number(r.pv);
      const total = Number(r.total);
      return {
        path: String(r.path),
        pv,
        uv: Number(r.uv),
        sharePercent: total > 0 ? (pv / total) * 100 : 0,
      };
    });
  }

  /** TopReferrers：空值归 "direct"（直接访问） */
  public async aggregateTopReferrers(
    params: VisitsWindowParams,
    limit: number,
  ): Promise<TopReferrerRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await db.execute<{
      referrer_host: string | null;
      pv: string | number;
      total: string | number;
    }>(sql`
      WITH scoped AS (
        SELECT COALESCE(NULLIF(referrer_host, ''), 'direct') AS referrer_host
        FROM page_view_raw
        WHERE project_id = ${projectId}
          AND ts_ms >= ${sinceMs}
          AND ts_ms <  ${untilMs}
      )
      SELECT
        referrer_host,
        COUNT(*)                             AS pv,
        (SELECT COUNT(*) FROM scoped)        AS total
      FROM scoped
      GROUP BY referrer_host
      ORDER BY pv DESC
      LIMIT ${clampedLimit}
    `);
    return rows.map((r) => {
      const pv = Number(r.pv);
      const total = Number(r.total);
      return {
        referrerHost: String(r.referrer_host ?? "direct"),
        pv,
        sharePercent: total > 0 ? (pv / total) * 100 : 0,
      };
    });
  }
}

/** PageViewEvent → page_view_raw 行映射 */
function toRow(e: PageViewEvent): NewPageViewRow {
  const url = e.page?.url ?? "";
  const path = e.page?.path ?? safePath(url);
  // SDK 端通过 collectPage() 从 document.referrer 采集，放在 page.referrer
  const referrer = e.page?.referrer ?? null;
  return {
    eventId: e.eventId,
    projectId: e.projectId,
    publicKey: e.publicKey,
    sessionId: e.sessionId ?? "",
    tsMs: e.timestamp,
    url,
    path,
    referrer,
    referrerHost: referrer ? safeHost(referrer).slice(0, 128) : null,
    loadType: e.loadType,
    isSpaNav: e.isSpaNav,
    durationMs: e.duration ?? null,
    ua: e.device?.ua,
    browser: e.device?.browser,
    os: e.device?.os,
    deviceType: e.device?.deviceType,
    release: e.release,
    environment: e.environment,
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url, "http://unknown.local").host;
  } catch {
    return "unknown";
  }
}

function safePath(url: string): string {
  try {
    return new URL(url, "http://unknown.local").pathname;
  } catch {
    return url || "/";
  }
}
