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

/** 留存矩阵 cohort 粒度（ADR-0028 / TM.2.E.1） */
export type RetentionIdentity = "session" | "user";

/** 留存参数 */
export interface RetentionParams {
  readonly projectId: string;
  readonly sinceMs: number;
  readonly untilMs: number;
  readonly cohortDays: number;
  readonly returnDays: number;
  readonly identity: RetentionIdentity;
}

/** 留存矩阵行（单 cohort_day + day_offset 交叉） */
export interface RetentionMatrixRow {
  readonly cohortDay: string; // ISO date "2026-04-23"
  readonly cohortSize: number; // 该 cohort 首日新用户数
  readonly dayOffset: number; // 0..returnDays
  readonly retained: number; // 当天仍访问的 uid 数（day 0 = cohortSize）
}

export const RETENTION_MIN_DAYS = 1;
export const RETENTION_MAX_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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

  /**
   * 留存矩阵聚合（ADR-0028 / TM.2.E.1）
   *
   * 单次往返 + CTE 两步计算：
   *  - scoped：按 identity 收敛 uid + 日粒度化（UTC）
   *  - first_seen：每个 uid 的首访日 = cohort_day
   *  - visits：cohort 窗口内新用户 × returnDays+1 观察天交叉
   *
   * 窗口语义（Mixpanel 风格）：
   *  - scan window = `[sinceMs, untilMs)`，全量扫描；
   *  - cohort window = **scan 窗口的后 cohortDays 天** `[untilMs - cohortDays*1d, untilMs)`，
   *    新用户必须在此区间首次出现才计入 cohort；
   *  - look-back = scan 窗口剩余 `returnDays` 天 `[sinceMs, untilMs - cohortDays*1d)`，
   *    仅用于识别"已知老用户"（他们的 first_seen 落在 look-back，HAVING 过滤）；
   *  - 如此今日刚访问的用户（first_seen=今天）可立刻出现在最新 cohort 的 day 0。
   *
   * 身份粒度：
   *  - identity='session'：uid = session_id（默认；与 /monitor/visits UV 口径一致）
   *  - identity='user'：uid = COALESCE(user_id, session_id)（对齐 funnel）
   *
   * 防御：
   *  - cohortDays / returnDays ∈ [1, 30]
   *  - 时间窗口 ≥ (cohortDays + returnDays) 天（否则尾 cohort 无足够观察期）
   *  - db=null 短路返回空数组，上层装配层生成 source=empty
   */
  public async aggregateRetention(
    params: RetentionParams,
  ): Promise<RetentionMatrixRow[]> {
    const {
      projectId,
      sinceMs,
      untilMs,
      cohortDays,
      returnDays,
      identity,
    } = params;
    if (
      !Number.isInteger(cohortDays) ||
      cohortDays < RETENTION_MIN_DAYS ||
      cohortDays > RETENTION_MAX_DAYS
    ) {
      throw new Error(
        `cohortDays 必须是 ${RETENTION_MIN_DAYS}~${RETENTION_MAX_DAYS} 的整数，实际 ${cohortDays}`,
      );
    }
    if (
      !Number.isInteger(returnDays) ||
      returnDays < RETENTION_MIN_DAYS ||
      returnDays > RETENTION_MAX_DAYS
    ) {
      throw new Error(
        `returnDays 必须是 ${RETENTION_MIN_DAYS}~${RETENTION_MAX_DAYS} 的整数，实际 ${returnDays}`,
      );
    }
    const requiredMs = (cohortDays + returnDays) * ONE_DAY_MS;
    if (untilMs - sinceMs < requiredMs) {
      throw new Error(
        `时间窗口 ${untilMs - sinceMs}ms 不足，至少需要 (cohortDays + returnDays) * 1d = ${requiredMs}ms`,
      );
    }

    const db = this.database.db;
    if (!db) return [];

    // cohort 窗口：sinceMs 起 cohortDays 天内命中的用户算新用户
    const cohortUntilMs = sinceMs + cohortDays * ONE_DAY_MS;
    // identity 不接受用户输入（DTO 已校验为枚举），此处仍走 sql.raw 与其他常量拼接分离
    const uidExpr =
      identity === "user"
        ? sql.raw("COALESCE(user_id, session_id)")
        : sql.raw("session_id");

    const rows = await db.execute<{
      cohort_day: Date | string;
      cohort_size: string | number;
      day_offset: string | number;
      retained: string | number;
    }>(sql`
      WITH scoped AS (
        SELECT
          ${uidExpr} AS uid,
          ts_ms,
          DATE_TRUNC('day', TO_TIMESTAMP(ts_ms / 1000.0) AT TIME ZONE 'UTC') AS day_utc
        FROM page_view_raw
        WHERE project_id = ${projectId}
          AND ts_ms >= ${sinceMs}
          AND ts_ms <  ${untilMs}
      ),
      first_seen AS (
        SELECT uid, MIN(day_utc) AS cohort_day
        FROM scoped
        GROUP BY uid
        HAVING MIN(ts_ms) >= ${sinceMs}
           AND MIN(ts_ms) <  ${cohortUntilMs}
      ),
      visits AS (
        SELECT DISTINCT s.uid, f.cohort_day, s.day_utc
        FROM scoped s
        JOIN first_seen f USING (uid)
        WHERE s.day_utc <= f.cohort_day + make_interval(days => ${returnDays})
      )
      SELECT
        f.cohort_day                                              AS cohort_day,
        (SELECT COUNT(*) FROM first_seen fs
           WHERE fs.cohort_day = f.cohort_day)                    AS cohort_size,
        EXTRACT(DAY FROM (v.day_utc - f.cohort_day))::int          AS day_offset,
        COUNT(DISTINCT v.uid)                                      AS retained
      FROM visits v
      JOIN first_seen f USING (uid)
      GROUP BY f.cohort_day, day_offset
      ORDER BY f.cohort_day ASC, day_offset ASC
    `);

    return rows.map((r) => ({
      cohortDay: toIsoDate(r.cohort_day),
      cohortSize: Number(r.cohort_size),
      dayOffset: Number(r.day_offset),
      retained: Number(r.retained),
    }));
  }
}

/** cohort_day 字段归一：PG Date | ISO 字符串 → "YYYY-MM-DD" */
function toIsoDate(v: Date | string): string {
  const d = v instanceof Date ? v : new Date(String(v));
  return d.toISOString().slice(0, 10);
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
