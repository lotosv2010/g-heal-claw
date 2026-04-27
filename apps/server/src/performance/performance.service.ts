import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type {
  LongTaskEvent,
  NavigationTiming,
  PerformanceEvent,
} from "@g-heal-claw/shared";
import { DatabaseService } from "../shared/database/database.service.js";
import {
  perfEventsRaw,
  type NewPerfEventRow,
} from "../shared/database/schema.js";

export type PerfOrLongTaskEvent = PerformanceEvent | LongTaskEvent;

/** Dashboard 聚合：单指标 p75 + 样本数（ADR-0015） */
export interface VitalAggregateRow {
  readonly metric: string;
  readonly p75: number;
  readonly sampleCount: number;
}

/** Dashboard 聚合：趋势桶原始行（hour × metric × p75），上层合并为 24 桶四指标 */
export interface TrendAggregateRow {
  readonly hour: string;
  readonly metric: string;
  readonly p75: number;
}

/** Dashboard 聚合：慢页面行 */
export interface SlowPageAggregateRow {
  readonly path: string;
  readonly sampleCount: number;
  readonly lcpP75Ms: number;
  readonly ttfbP75Ms: number;
}

/** 聚合窗口参数 */
export interface WindowParams {
  readonly projectId: string;
  readonly sinceMs: number;
  readonly untilMs: number;
}

/**
 * 性能事件落库服务（ADR-0013）
 *
 * - performance / long_task 统一写入 `perf_events_raw`
 * - 幂等：event_id UNIQUE + ON CONFLICT DO NOTHING
 * - test 环境（无 DB 连接）下短路返回 0
 */
@Injectable()
export class PerformanceService {
  private readonly logger = new Logger(PerformanceService.name);

  public constructor(private readonly database: DatabaseService) {}

  /**
   * 批量写入性能事件
   *
   * 返回实际插入行数（冲突行会被 ON CONFLICT 吞掉，不计入）。
   */
  public async saveBatch(events: readonly PerfOrLongTaskEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    const db = this.database.db;
    if (!db) {
      // test 环境或 DB 未就绪；此处保持静默以不阻塞 HTTP 响应
      return 0;
    }
    const rows = events.map(toRow);
    try {
      const inserted = await db
        .insert(perfEventsRaw)
        .values(rows)
        .onConflictDoNothing({ target: perfEventsRaw.eventId })
        .returning({ id: perfEventsRaw.id });
      return inserted.length;
    } catch (err) {
      // 持久化失败不抛出：事件丢失优于影响上报链路
      this.logger.error(
        `性能事件写入失败：${(err as Error).message}`,
        (err as Error).stack,
      );
      return 0;
    }
  }

  /**
   * 简单总数查询（调试用）；T2.1.6 已提供带筛选的 Dashboard 聚合 API
   */
  public async countForProject(projectId: string): Promise<number> {
    const db = this.database.db;
    if (!db) return 0;
    const result = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(perfEventsRaw)
      .where(sql`${perfEventsRaw.projectId} = ${projectId}`);
    return result[0]?.c ?? 0;
  }

  /**
   * 聚合：5 个 Web Vitals 的 p75 + 样本数（ADR-0015）
   *
   * 走 `idx_perf_project_metric_ts` 索引；metric IN (...) 时 PG 走 Index Scan。
   */
  public async aggregateVitals(params: WindowParams): Promise<VitalAggregateRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      metric: string;
      p75: string | number | null;
      n: string | number;
    }>(sql`
      SELECT
        metric,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75,
        COUNT(*) AS n
      FROM perf_events_raw
      WHERE project_id = ${projectId}
        AND type = 'performance'
        AND metric IS NOT NULL
        AND value IS NOT NULL
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY metric
    `);
    return rows.map((r) => ({
      metric: String(r.metric),
      p75: r.p75 == null ? 0 : Number(r.p75),
      sampleCount: Number(r.n),
    }));
  }

  /**
   * 聚合：按小时 × metric 的 p75 桶（LCP/FCP/INP/TTFB，四指标）
   *
   * 返回原始长表行；上层按 hour 合并成宽表 TrendBucketDto。
   */
  public async aggregateTrend(params: WindowParams): Promise<TrendAggregateRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      hour: Date | string;
      metric: string;
      p75: string | number | null;
    }>(sql`
      SELECT
        date_trunc('hour', to_timestamp(ts_ms / 1000.0)) AS hour,
        metric,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75
      FROM perf_events_raw
      WHERE project_id = ${projectId}
        AND type = 'performance'
        AND metric IN ('LCP','FCP','INP','TTFB')
        AND value IS NOT NULL
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY hour, metric
      ORDER BY hour ASC
    `);
    return rows.map((r) => ({
      // PG 驱动可能返回 Date 或 ISO 字符串，统一成 ISO 以简化前端
      hour:
        r.hour instanceof Date
          ? r.hour.toISOString()
          : new Date(String(r.hour)).toISOString(),
      metric: String(r.metric),
      p75: r.p75 == null ? 0 : Number(r.p75),
    }));
  }

  /**
   * 聚合：瀑布图阶段（ADR-0015）
   *
   * 取该窗口内最多 N 行有 navigation 的 TTFB 事件 → 字段取中位数；
   * 少量采样即可稳定（瀑布图用于展示"一般情况"而非 p75 压线）。
   */
  public async aggregateWaterfallSamples(
    params: WindowParams,
    limit = 200,
  ): Promise<readonly NavigationTiming[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    // 直接取 JSONB，Drizzle 会反序列化为对象
    const rows = await db.execute<{ navigation: NavigationTiming | null }>(sql`
      SELECT navigation
      FROM perf_events_raw
      WHERE project_id = ${projectId}
        AND type = 'performance'
        AND metric = 'TTFB'
        AND navigation IS NOT NULL
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      ORDER BY ts_ms DESC
      LIMIT ${limit}
    `);
    return rows
      .map((r) => r.navigation)
      .filter((n): n is NavigationTiming => n !== null);
  }

  /**
   * 聚合：按 path 的 LCP p75 倒序，并对同组取 TTFB p75
   *
   * 两轮查询：
   *  1) 先出 Top N 的 path + LCP p75 + 样本数（LCP 主排序）
   *  2) 对这 N 个 path 一次性查 TTFB p75（走同一索引）
   */
  public async aggregateSlowPages(
    params: WindowParams,
    limit: number,
  ): Promise<SlowPageAggregateRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;

    const lcpRows = await db.execute<{
      path: string;
      n: string | number;
      lcp_p75: string | number | null;
    }>(sql`
      SELECT
        path,
        COUNT(*) AS n,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS lcp_p75
      FROM perf_events_raw
      WHERE project_id = ${projectId}
        AND type = 'performance'
        AND metric = 'LCP'
        AND value IS NOT NULL
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY path
      ORDER BY lcp_p75 DESC NULLS LAST
      LIMIT ${limit}
    `);

    if (lcpRows.length === 0) return [];

    const paths = lcpRows.map((r) => String(r.path));
    const ttfbRows = await db.execute<{
      path: string;
      ttfb_p75: string | number | null;
    }>(sql`
      SELECT
        path,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS ttfb_p75
      FROM perf_events_raw
      WHERE project_id = ${projectId}
        AND type = 'performance'
        AND metric = 'TTFB'
        AND value IS NOT NULL
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
        AND path IN (${sql.join(paths.map((p) => sql`${p}`), sql`, `)})
      GROUP BY path
    `);
    const ttfbByPath = new Map<string, number>(
      ttfbRows.map((r) => [String(r.path), r.ttfb_p75 == null ? 0 : Number(r.ttfb_p75)]),
    );

    return lcpRows.map((r) => ({
      path: String(r.path),
      sampleCount: Number(r.n),
      lcpP75Ms: r.lcp_p75 == null ? 0 : Number(r.lcp_p75),
      ttfbP75Ms: ttfbByPath.get(String(r.path)) ?? 0,
    }));
  }
}

function toRow(event: PerfOrLongTaskEvent): NewPerfEventRow {
  const base: NewPerfEventRow = {
    eventId: event.eventId,
    projectId: event.projectId,
    publicKey: event.publicKey,
    sessionId: event.sessionId,
    tsMs: event.timestamp,
    type: event.type,
    url: event.page.url,
    path: event.page.path,
    ua: event.device.ua,
    browser: event.device.browser,
    os: event.device.os,
    deviceType: event.device.deviceType,
    release: event.release,
    environment: event.environment,
    metric: null,
    value: null,
    rating: null,
    ltDurationMs: null,
    ltStartMs: null,
    navigation: null,
  };
  if (event.type === "performance") {
    return {
      ...base,
      metric: event.metric,
      value: event.value,
      rating: event.rating,
      navigation: event.navigation ?? null,
    };
  }
  // long_task
  return {
    ...base,
    ltDurationMs: event.duration,
    ltStartMs: event.startTime,
  };
}
