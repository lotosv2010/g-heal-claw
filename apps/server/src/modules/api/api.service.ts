import { type Granularity, truncSql } from "../../shared/granularity.js";
import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { ApiEvent } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import {
  apiEventsRaw,
  type NewApiEventRow,
} from "../../shared/database/schema.js";

/** 聚合：窗口参数（与 ErrorsService / PerformanceService 同构） */
export interface ApiWindowParams {
  readonly projectId: string;
  readonly sinceMs: number;
  readonly untilMs: number;
  readonly granularity?: Granularity;
  readonly environment?: string;
}

/** 聚合：总览（样本量 / 慢占比 / 错误率 / p75） */
export interface ApiSummaryRow {
  readonly totalRequests: number;
  readonly slowCount: number;
  readonly failedCount: number;
  readonly p75DurationMs: number;
}

/** 聚合：状态码桶 */
export interface StatusBucketRow {
  /** "2xx" | "3xx" | "4xx" | "5xx" | "0" */
  readonly bucket: string;
  readonly count: number;
}

/** 聚合：每小时桶（吞吐 + 慢请求 + 失败数 + 均耗时 + 成功率） */
export interface ApiTrendRow {
  readonly hour: string;
  readonly count: number;
  readonly slowCount: number;
  readonly failedCount: number;
  /** 该小时所有请求的平均耗时（毫秒） */
  readonly avgDurationMs: number;
  /** 成功率（0~1，status 2xx/3xx 占比） */
  readonly successRatio: number;
}

/** 聚合：Top 慢请求分组（按 method + pathTemplate + host） */
export interface SlowApiRow {
  readonly method: string;
  readonly host: string;
  readonly pathTemplate: string;
  readonly sampleCount: number;
  readonly p75DurationMs: number;
  readonly failureRatio: number;
}

/** 聚合：Top 请求分组（按样本量倒序） */
export interface TopRequestRow {
  readonly method: string;
  readonly host: string;
  readonly pathTemplate: string;
  readonly sampleCount: number;
  readonly avgDurationMs: number;
  readonly failureRatio: number;
}

/** 聚合：访问页面 TOP（按 pagePath 聚合 API 请求） */
export interface TopPageRow {
  readonly pagePath: string;
  readonly requestCount: number;
  readonly avgDurationMs: number;
  readonly failedCount: number;
  readonly failureRatio: number;
}

/** 聚合：HTTP 异常状态码 TOP（4xx / 5xx / 0） */
export interface ErrorStatusRow {
  readonly status: number;
  readonly count: number;
  readonly ratio: number;
}

/** 聚合：维度分布单行（browser / os / device_type 共用） */
export interface DimensionRow {
  readonly value: string;
  readonly sampleCount: number;
  readonly sharePercent: number;
  readonly avgDurationMs: number;
  readonly failureRatio: number;
}

/** 已接入的 3 个维度列 */
export type DimensionKey = "browser" | "os" | "device_type";

/**
 * API 请求事件落库 + 聚合服务（ADR-0020 §4.2）
 *
 * 职责：
 *  - `saveBatch`：apiPlugin 批量明细 → `api_events_raw`，`event_id UNIQUE` 幂等
 *  - `aggregate*`：Dashboard `/dashboard/v1/api/overview` 聚合驱动（下一子任务实装）
 *
 * 与 ErrorsService 的分工（ADR-0020 §4.1）：`ErrorsService` 只处理 `type='error'` 的
 * ajax / api_code；本服务处理 `type='api'` 的全量明细（含成功）。
 */
@Injectable()
export class ApiService {
  private readonly logger = new Logger(ApiService.name);

  public constructor(private readonly database: DatabaseService) {}

  public async saveBatch(events: readonly ApiEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    const db = this.database.db;
    if (!db) return 0;
    const rows = events.map(toRow);
    try {
      const inserted = await db
        .insert(apiEventsRaw)
        .values(rows)
        .onConflictDoNothing({ target: apiEventsRaw.eventId })
        .returning({ id: apiEventsRaw.id });
      return inserted.length;
    } catch (err) {
      this.logger.error(
        `API 事件写入失败：${(err as Error).message}`,
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
      .from(apiEventsRaw)
      .where(sql`${apiEventsRaw.projectId} = ${projectId}`);
    return result[0]?.c ?? 0;
  }

  /** 窗口总览：样本 / 慢占比 / 错误率 / p75 耗时 */
  public async aggregateSummary(
    params: ApiWindowParams,
  ): Promise<ApiSummaryRow> {
    const db = this.database.db;
    if (!db) {
      return { totalRequests: 0, slowCount: 0, failedCount: 0, p75DurationMs: 0 };
    }
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      total: string | number;
      slow: string | number;
      failed: string | number;
      p75: string | number | null;
    }>(sql`
      SELECT
        COUNT(*)                                               AS total,
        COUNT(*) FILTER (WHERE slow = true)                    AS slow,
        COUNT(*) FILTER (WHERE failed = true)                  AS failed,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY duration_ms) AS p75
      FROM api_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
    `);
    const first = rows[0];
    if (!first) {
      return { totalRequests: 0, slowCount: 0, failedCount: 0, p75DurationMs: 0 };
    }
    return {
      totalRequests: Number(first.total),
      slowCount: Number(first.slow),
      failedCount: Number(first.failed),
      p75DurationMs: first.p75 == null ? 0 : Number(first.p75),
    };
  }

  /** 状态码桶：2xx / 3xx / 4xx / 5xx / 0（网络失败） */
  public async aggregateStatusBuckets(
    params: ApiWindowParams,
  ): Promise<StatusBucketRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      bucket: string;
      n: string | number;
    }>(sql`
      SELECT
        CASE
          WHEN status = 0              THEN '0'
          WHEN status BETWEEN 200 AND 299 THEN '2xx'
          WHEN status BETWEEN 300 AND 399 THEN '3xx'
          WHEN status BETWEEN 400 AND 499 THEN '4xx'
          WHEN status BETWEEN 500 AND 599 THEN '5xx'
          ELSE 'other'
        END               AS bucket,
        COUNT(*)          AS n
      FROM api_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);
    return rows.map((r) => ({
      bucket: String(r.bucket),
      count: Number(r.n),
    }));
  }

  /** 每小时吞吐 + 慢请求数 + 失败数 + 均耗时 + 成功率 */
  public async aggregateTrend(
    params: ApiWindowParams,
  ): Promise<ApiTrendRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const trunc = truncSql(params.granularity);
    const rows = await db.execute<{
      hour: Date | string;
      n: string | number;
      slow: string | number;
      failed: string | number;
      avg: string | number | null;
      ok: string | number;
    }>(sql`
      SELECT
        ${trunc}                                                          AS hour,
        COUNT(*)                                                          AS n,
        COUNT(*) FILTER (WHERE slow = true)                               AS slow,
        COUNT(*) FILTER (WHERE failed = true)                             AS failed,
        AVG(duration_ms)                                                  AS avg,
        COUNT(*) FILTER (WHERE status BETWEEN 200 AND 399)                AS ok
      FROM api_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
        ${params.environment ? sql`AND environment = ${params.environment}` : sql``}
      GROUP BY hour
      ORDER BY hour ASC
    `);
    return rows.map((r) => {
      const count = Number(r.n);
      const ok = Number(r.ok);
      return {
        hour:
          r.hour instanceof Date
            ? r.hour.toISOString()
            : new Date(String(r.hour)).toISOString(),
        count,
        slowCount: Number(r.slow),
        failedCount: Number(r.failed),
        avgDurationMs: r.avg == null ? 0 : Number(r.avg),
        successRatio: count > 0 ? ok / count : 0,
      };
    });
  }

  /** Top 慢请求（method + pathTemplate + host，按 p75 duration 倒序） */
  public async aggregateSlowApis(
    params: ApiWindowParams,
    limit: number,
  ): Promise<SlowApiRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await db.execute<{
      method: string;
      host: string;
      path_template: string;
      n: string | number;
      p75: string | number | null;
      failed: string | number;
    }>(sql`
      SELECT
        method,
        host,
        path_template,
        COUNT(*)                                                  AS n,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY duration_ms) AS p75,
        COUNT(*) FILTER (WHERE failed = true)                     AS failed
      FROM api_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY method, host, path_template
      ORDER BY p75 DESC NULLS LAST
      LIMIT ${clampedLimit}
    `);
    return rows.map((r) => {
      const count = Number(r.n);
      const failed = Number(r.failed);
      return {
        method: String(r.method),
        host: String(r.host),
        pathTemplate: String(r.path_template),
        sampleCount: count,
        p75DurationMs: r.p75 == null ? 0 : Number(r.p75),
        failureRatio: count > 0 ? failed / count : 0,
      };
    });
  }

  /** Top 请求（method + host + pathTemplate，按样本量倒序） */
  public async aggregateTopRequests(
    params: ApiWindowParams,
    limit: number,
  ): Promise<TopRequestRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await db.execute<{
      method: string;
      host: string;
      path_template: string;
      n: string | number;
      avg: string | number | null;
      failed: string | number;
    }>(sql`
      SELECT
        method,
        host,
        path_template,
        COUNT(*)                                AS n,
        AVG(duration_ms)                        AS avg,
        COUNT(*) FILTER (WHERE failed = true)   AS failed
      FROM api_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY method, host, path_template
      ORDER BY n DESC
      LIMIT ${clampedLimit}
    `);
    return rows.map((r) => {
      const count = Number(r.n);
      const failed = Number(r.failed);
      return {
        method: String(r.method),
        host: String(r.host),
        pathTemplate: String(r.path_template),
        sampleCount: count,
        avgDurationMs: r.avg == null ? 0 : Number(r.avg),
        failureRatio: count > 0 ? failed / count : 0,
      };
    });
  }

  /** 访问页面 TOP（按 page_path 聚合 API 请求） */
  public async aggregateTopPages(
    params: ApiWindowParams,
    limit: number,
  ): Promise<TopPageRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await db.execute<{
      page_path: string;
      n: string | number;
      avg: string | number | null;
      failed: string | number;
    }>(sql`
      SELECT
        page_path,
        COUNT(*)                                AS n,
        AVG(duration_ms)                        AS avg,
        COUNT(*) FILTER (WHERE failed = true)   AS failed
      FROM api_events_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
        AND page_path <> ''
      GROUP BY page_path
      ORDER BY n DESC
      LIMIT ${clampedLimit}
    `);
    return rows.map((r) => {
      const count = Number(r.n);
      const failed = Number(r.failed);
      return {
        pagePath: String(r.page_path),
        requestCount: count,
        avgDurationMs: r.avg == null ? 0 : Number(r.avg),
        failedCount: failed,
        failureRatio: count > 0 ? failed / count : 0,
      };
    });
  }

  /**
   * 单维度分布（按 column 聚合）：样本数 / 占比 / 均耗时 / 失败率
   *
   * column 白名单约束在 DimensionKey，避免 SQL 注入
   */
  public async aggregateDimension(
    params: ApiWindowParams,
    column: DimensionKey,
    limit: number,
  ): Promise<DimensionRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clampedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const colSql =
      column === "browser"
        ? sql`browser`
        : column === "os"
          ? sql`os`
          : sql`device_type`;
    const rows = await db.execute<{
      value: string | null;
      n: string | number;
      total: string | number;
      avg: string | number | null;
      failed: string | number;
    }>(sql`
      WITH scoped AS (
        SELECT ${colSql} AS v, duration_ms, failed
        FROM api_events_raw
        WHERE project_id = ${projectId}
          AND ts_ms >= ${sinceMs}
          AND ts_ms <  ${untilMs}
      )
      SELECT
        COALESCE(NULLIF(v, ''), 'unknown')      AS value,
        COUNT(*)                                AS n,
        (SELECT COUNT(*) FROM scoped)           AS total,
        AVG(duration_ms)                        AS avg,
        COUNT(*) FILTER (WHERE failed = true)   AS failed
      FROM scoped
      GROUP BY value
      ORDER BY n DESC
      LIMIT ${clampedLimit}
    `);
    return rows.map((r) => {
      const count = Number(r.n);
      const total = Number(r.total);
      const failed = Number(r.failed);
      return {
        value: String(r.value ?? "unknown"),
        sampleCount: count,
        sharePercent: total > 0 ? (count / total) * 100 : 0,
        avgDurationMs: r.avg == null ? 0 : Number(r.avg),
        failureRatio: count > 0 ? failed / count : 0,
      };
    });
  }

  /** HTTP 异常状态码 TOP（仅 4xx / 5xx / 0，按次数倒序） */
  public async aggregateErrorStatus(
    params: ApiWindowParams,
    limit: number,
  ): Promise<ErrorStatusRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await db.execute<{
      status: number | string;
      n: string | number;
      total: string | number;
    }>(sql`
      WITH scoped AS (
        SELECT status
        FROM api_events_raw
        WHERE project_id = ${projectId}
          AND ts_ms >= ${sinceMs}
          AND ts_ms <  ${untilMs}
      )
      SELECT
        status,
        COUNT(*)                                          AS n,
        (SELECT COUNT(*) FROM scoped)                     AS total
      FROM scoped
      WHERE status = 0 OR status BETWEEN 400 AND 599
      GROUP BY status
      ORDER BY n DESC
      LIMIT ${clampedLimit}
    `);
    return rows.map((r) => {
      const count = Number(r.n);
      const total = Number(r.total);
      return {
        status: Number(r.status),
        count,
        ratio: total > 0 ? count / total : 0,
      };
    });
  }
}

/** ApiEvent → api_events_raw 行映射 */
function toRow(e: ApiEvent): NewApiEventRow {
  const host = safeHost(e.url);
  const path = safePath(e.url);
  return {
    eventId: e.eventId,
    projectId: e.projectId,
    publicKey: e.publicKey,
    sessionId: e.sessionId ?? "",
    tsMs: e.timestamp,
    method: e.method.slice(0, 16),
    requestUrl: e.url,
    host: host.slice(0, 128),
    path,
    pathTemplate: path, // T2.2.4 引入 pathTemplate 提取前 = path
    status: e.status,
    durationMs: e.duration,
    requestSize: e.requestSize,
    responseSize: e.responseSize,
    slow: e.slow ?? false,
    failed: e.failed ?? false,
    errorMessage: e.errorMessage,
    traceId: e.traceId,
    breadcrumbs: e.breadcrumbs,
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

function safePath(url: string): string {
  try {
    return new URL(url, "http://unknown.local").pathname;
  } catch {
    return url;
  }
}
