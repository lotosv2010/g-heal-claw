import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { ResourceEvent } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import {
  resourceEventsRaw,
  type NewResourceEventRow,
} from "../../shared/database/schema.js";

/** 窗口参数（与 ApiMonitor / Errors / Performance 同构） */
export interface ResourceWindowParams {
  readonly projectId: string;
  readonly sinceMs: number;
  readonly untilMs: number;
}

/** 资源总览 */
export interface ResourceSummaryRow {
  readonly totalRequests: number;
  readonly failedCount: number;
  readonly slowCount: number;
  readonly p75DurationMs: number;
  readonly totalTransferBytes: number;
}

/** 6 类分类桶 */
export interface CategoryBucketRow {
  readonly category: string;
  readonly count: number;
  readonly failedCount: number;
  readonly slowCount: number;
  readonly avgDurationMs: number;
}

/** 每小时趋势（总量 / 失败 / 慢 / 均耗时） */
export interface ResourceTrendRow {
  readonly hour: string;
  readonly count: number;
  readonly failedCount: number;
  readonly slowCount: number;
  readonly avgDurationMs: number;
}

/** Top 慢资源（category + host + url，按 p75 倒序） */
export interface SlowResourceRow {
  readonly category: string;
  readonly host: string;
  readonly url: string;
  readonly sampleCount: number;
  readonly p75DurationMs: number;
  readonly failureRatio: number;
}

/** Top 失败 host */
export interface FailingHostRow {
  readonly host: string;
  readonly totalRequests: number;
  readonly failedCount: number;
  readonly failureRatio: number;
}

/** 6 类固定占位顺序（前端 UI 稳定） */
const FIXED_CATEGORIES: readonly string[] = [
  "script",
  "stylesheet",
  "image",
  "font",
  "media",
  "other",
];

/**
 * 静态资源事件落库 + 聚合服务（ADR-0022 §3）
 *
 * 职责：
 *  - `saveBatch`：resourcePlugin 批量明细 → `resource_events_raw`，`event_id UNIQUE` 幂等
 *  - `aggregate*`：Dashboard `/dashboard/v1/resources/overview` 聚合驱动
 *
 * 与 ApiService 的分工（ADR-0022 §1 / ADR-0025 命名统一）：
 *  - ApiService：fetch / XHR 业务请求全量
 *  - ResourcesService：script / stylesheet / image / font / media / other 全量 RT 样本
 */
@Injectable()
export class ResourcesService {
  private readonly logger = new Logger(ResourcesService.name);

  public constructor(private readonly database: DatabaseService) {}

  /** 批量落库（幂等：event_id UNIQUE） */
  public async saveBatch(events: readonly ResourceEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    const db = this.database.db;
    if (!db) return 0;
    const rows = events.map(toRow);
    try {
      const inserted = await db
        .insert(resourceEventsRaw)
        .values(rows)
        .onConflictDoNothing({ target: resourceEventsRaw.eventId })
        .returning({ id: resourceEventsRaw.id });
      return inserted.length;
    } catch (err) {
      this.logger.error(
        `Resource 事件写入失败：${(err as Error).message}`,
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
      .from(resourceEventsRaw)
      .where(sql`${resourceEventsRaw.projectId} = ${projectId}`);
    return result[0]?.c ?? 0;
  }

  /** 窗口总览 */
  public async aggregateSummary(
    params: ResourceWindowParams,
  ): Promise<ResourceSummaryRow> {
    const db = this.database.db;
    const empty: ResourceSummaryRow = {
      totalRequests: 0,
      failedCount: 0,
      slowCount: 0,
      p75DurationMs: 0,
      totalTransferBytes: 0,
    };
    if (!db) return empty;
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      total: string | number;
      failed: string | number;
      slow: string | number;
      p75: string | number | null;
      bytes: string | number | null;
    }>(sql`
      SELECT
        COUNT(*)                                                          AS total,
        COUNT(*) FILTER (WHERE failed = true)                             AS failed,
        COUNT(*) FILTER (WHERE slow = true)                               AS slow,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY duration_ms)         AS p75,
        COALESCE(SUM(transfer_size), 0)                                   AS bytes
      FROM resource_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
    `);
    const first = rows[0];
    if (!first) return empty;
    return {
      totalRequests: Number(first.total),
      failedCount: Number(first.failed),
      slowCount: Number(first.slow),
      p75DurationMs: first.p75 == null ? 0 : Number(first.p75),
      totalTransferBytes: first.bytes == null ? 0 : Number(first.bytes),
    };
  }

  /** 6 类固定占位 */
  public async aggregateCategoryBuckets(
    params: ResourceWindowParams,
  ): Promise<CategoryBucketRow[]> {
    const db = this.database.db;
    const defaults: CategoryBucketRow[] = FIXED_CATEGORIES.map((c) => ({
      category: c,
      count: 0,
      failedCount: 0,
      slowCount: 0,
      avgDurationMs: 0,
    }));
    if (!db) return defaults;
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      category: string;
      n: string | number;
      failed: string | number;
      slow: string | number;
      avg: string | number | null;
    }>(sql`
      SELECT
        category,
        COUNT(*)                                AS n,
        COUNT(*) FILTER (WHERE failed = true)   AS failed,
        COUNT(*) FILTER (WHERE slow = true)     AS slow,
        AVG(duration_ms)                        AS avg
      FROM resource_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY category
    `);
    const lookup = new Map<string, CategoryBucketRow>();
    for (const r of rows) {
      lookup.set(String(r.category), {
        category: String(r.category),
        count: Number(r.n),
        failedCount: Number(r.failed),
        slowCount: Number(r.slow),
        avgDurationMs: r.avg == null ? 0 : Number(r.avg),
      });
    }
    return FIXED_CATEGORIES.map(
      (c) =>
        lookup.get(c) ?? {
          category: c,
          count: 0,
          failedCount: 0,
          slowCount: 0,
          avgDurationMs: 0,
        },
    );
  }

  /** 每小时趋势 */
  public async aggregateTrend(
    params: ResourceWindowParams,
  ): Promise<ResourceTrendRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      hour: Date | string;
      n: string | number;
      failed: string | number;
      slow: string | number;
      avg: string | number | null;
    }>(sql`
      SELECT
        date_trunc('hour', to_timestamp(ts_ms / 1000.0))     AS hour,
        COUNT(*)                                             AS n,
        COUNT(*) FILTER (WHERE failed = true)                AS failed,
        COUNT(*) FILTER (WHERE slow = true)                  AS slow,
        AVG(duration_ms)                                     AS avg
      FROM resource_events_raw
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
      failedCount: Number(r.failed),
      slowCount: Number(r.slow),
      avgDurationMs: r.avg == null ? 0 : Number(r.avg),
    }));
  }

  /** Top 慢资源（category + host + url，按 p75 倒序） */
  public async aggregateSlowResources(
    params: ResourceWindowParams,
    limit: number,
  ): Promise<SlowResourceRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await db.execute<{
      category: string;
      host: string;
      url: string;
      n: string | number;
      p75: string | number | null;
      failed: string | number;
    }>(sql`
      SELECT
        category,
        host,
        url,
        COUNT(*)                                                  AS n,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY duration_ms) AS p75,
        COUNT(*) FILTER (WHERE failed = true)                     AS failed
      FROM resource_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY category, host, url
      ORDER BY p75 DESC NULLS LAST
      LIMIT ${clampedLimit}
    `);
    return rows.map((r) => {
      const count = Number(r.n);
      const failed = Number(r.failed);
      return {
        category: String(r.category),
        host: String(r.host),
        url: String(r.url),
        sampleCount: count,
        p75DurationMs: r.p75 == null ? 0 : Number(r.p75),
        failureRatio: count > 0 ? failed / count : 0,
      };
    });
  }

  /** Top 失败 host（按 failure_rate 倒序，过滤样本量 < 3 噪声） */
  public async aggregateFailingHosts(
    params: ResourceWindowParams,
    limit: number,
  ): Promise<FailingHostRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await db.execute<{
      host: string;
      n: string | number;
      failed: string | number;
    }>(sql`
      SELECT
        host,
        COUNT(*)                                AS n,
        COUNT(*) FILTER (WHERE failed = true)   AS failed
      FROM resource_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
        AND host <> ''
      GROUP BY host
      HAVING COUNT(*) FILTER (WHERE failed = true) > 0
      ORDER BY (COUNT(*) FILTER (WHERE failed = true))::float / NULLIF(COUNT(*), 0) DESC,
               COUNT(*) FILTER (WHERE failed = true) DESC
      LIMIT ${clampedLimit}
    `);
    return rows.map((r) => {
      const count = Number(r.n);
      const failed = Number(r.failed);
      return {
        host: String(r.host),
        totalRequests: count,
        failedCount: failed,
        failureRatio: count > 0 ? failed / count : 0,
      };
    });
  }
}

// ---- 映射 ----

function toRow(e: ResourceEvent): NewResourceEventRow {
  return {
    eventId: e.eventId,
    projectId: e.projectId,
    publicKey: e.publicKey,
    sessionId: e.sessionId ?? "",
    tsMs: e.timestamp,
    category: (e.category ?? "other").slice(0, 16),
    initiatorType: (e.initiatorType ?? "").slice(0, 32),
    host: (e.host ?? safeHost(e.url)).slice(0, 128),
    url: e.url,
    durationMs: e.duration,
    transferSize: e.transferSize,
    encodedSize: e.encodedSize,
    decodedSize: e.decodedSize,
    protocol: e.protocol,
    cache: e.cache ?? "unknown",
    slow: e.slow ?? false,
    failed: e.failed ?? false,
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

function safeHost(url: string): string {
  try {
    return new URL(url, "http://unknown.local").host;
  } catch {
    return "unknown";
  }
}
