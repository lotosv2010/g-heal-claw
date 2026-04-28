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

/** Dashboard 聚合：趋势桶原始行（hour × metric × p75），上层合并为 24 桶多系列 */
export interface TrendAggregateRow {
  readonly hour: string;
  readonly metric: string;
  readonly p75: number;
}

/** Dashboard 聚合：每小时 Navigation 子字段 p75 + 样本数（navigation 来自 TTFB 事件 jsonb 列） */
export interface NavigationTrendRow {
  readonly hour: string;
  readonly dnsP75: number;
  readonly tcpP75: number;
  readonly sslP75: number;
  readonly responseP75: number;
  readonly domParseP75: number;
  readonly resourceLoadP75: number;
  readonly sampleCount: number;
}

/** Dashboard 聚合：慢页面行 */
export interface SlowPageAggregateRow {
  readonly path: string;
  readonly sampleCount: number;
  readonly lcpP75Ms: number;
  readonly ttfbP75Ms: number;
}

/** Dashboard 聚合：维度分布行（如浏览器 / OS / 平台） */
export interface DimensionAggregateRow {
  readonly value: string;
  readonly sampleCount: number;
  readonly fmpAvgMs: number;
}

/** 维度字段枚举 —— 对应 perf_events_raw 列 */
export type DimensionField = "browser" | "os" | "deviceType";

/**
 * Dashboard 聚合：按 path 的 FMP（首屏时间）视图
 *
 * - `fmpAvgMs`：FSP 指标按 path 聚合的平均值（ms）
 * - `fullyLoadedAvgMs`：LCP 平均值（ms，作为页面完全加载的近似）
 * - `within3sRatio`：FSP ≤ 3000ms 的样本占比 [0,1]
 * - `sampleCount`：该 path 的 FSP 事件数
 */
export interface FmpPageAggregateRow {
  readonly path: string;
  readonly sampleCount: number;
  readonly fmpAvgMs: number;
  readonly fullyLoadedAvgMs: number;
  readonly within3sRatio: number;
}

/** 聚合窗口参数 */
export interface WindowParams {
  readonly projectId: string;
  readonly sinceMs: number;
  readonly untilMs: number;
}

/** Dashboard 聚合：长任务摘要（type = 'long_task'） */
export interface LongTaskSummaryRow {
  /** 时间窗内长任务样本数 */
  readonly count: number;
  /** 所有长任务 duration 总和（ms） */
  readonly totalMs: number;
  /** duration 的 p75（ms） */
  readonly p75Ms: number;
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
   * 聚合：长任务（type='long_task'） 窗口内 count / totalMs / p75(duration)
   *
   * 来源 `perf_events_raw.lt_duration_ms`。无样本时返回 0 填充，前端判空而非抛错。
   */
  public async aggregateLongTasks(
    params: WindowParams,
  ): Promise<LongTaskSummaryRow> {
    const db = this.database.db;
    if (!db) return { count: 0, totalMs: 0, p75Ms: 0 };
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      n: string | number;
      total: string | number | null;
      p75: string | number | null;
    }>(sql`
      SELECT
        COUNT(*) AS n,
        COALESCE(SUM(lt_duration_ms), 0) AS total,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY lt_duration_ms) AS p75
      FROM perf_events_raw
      WHERE project_id = ${projectId}
        AND type = 'long_task'
        AND lt_duration_ms IS NOT NULL
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
    `);
    const r = rows[0];
    return {
      count: r ? Number(r.n) : 0,
      totalMs: r && r.total != null ? Math.round(Number(r.total)) : 0,
      p75Ms: r && r.p75 != null ? Math.round(Number(r.p75)) : 0,
    };
  }

  /**
   * 聚合：按小时 × metric 的 p75 桶（LCP/FCP/CLS/INP/TTFB/FID/TTI/TBT/FSP）
   *
   * 返回原始长表行；上层按 hour 合并成宽表 TrendBucketDto。
   * 所有 web-vitals 核心指标 + 废弃 + 自定义 FSP + Lighthouse TBT 全部走这一查询。
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
        AND metric IN ('LCP','FCP','CLS','INP','TTFB','FID','TTI','TBT','FSP')
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
   * 聚合：按小时桶的 Navigation 子字段 p75 + 样本数
   *
   * navigation 存于 TTFB 事件的 jsonb 列，包含 dns/tcp/ssl/response/domParse/resourceLoad 6 段。
   * 样本数按该小时内带 navigation 的 TTFB 事件数量统计（与页面访问数近似）。
   *
   * SQL 约束：percentile_cont 不能对 NULL 运算，此处 COALESCE(..., 0) 兜底；
   * 没有 navigation 的小时直接不产生行（上层以 Map 合并）。
   */
  public async aggregateNavigationTrend(
    params: WindowParams,
  ): Promise<NavigationTrendRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      hour: Date | string;
      dns_p75: string | number | null;
      tcp_p75: string | number | null;
      ssl_p75: string | number | null;
      response_p75: string | number | null;
      dom_parse_p75: string | number | null;
      resource_load_p75: string | number | null;
      n: string | number;
    }>(sql`
      SELECT
        date_trunc('hour', to_timestamp(ts_ms / 1000.0)) AS hour,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY COALESCE((navigation->>'dns')::numeric, 0)) AS dns_p75,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY COALESCE((navigation->>'tcp')::numeric, 0)) AS tcp_p75,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY COALESCE((navigation->>'ssl')::numeric, 0)) AS ssl_p75,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY COALESCE((navigation->>'response')::numeric, 0)) AS response_p75,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY COALESCE((navigation->>'domParse')::numeric, 0)) AS dom_parse_p75,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY COALESCE((navigation->>'resourceLoad')::numeric, 0)) AS resource_load_p75,
        COUNT(*) AS n
      FROM perf_events_raw
      WHERE project_id = ${projectId}
        AND type = 'performance'
        AND metric = 'TTFB'
        AND navigation IS NOT NULL
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
      dnsP75: r.dns_p75 == null ? 0 : Number(r.dns_p75),
      tcpP75: r.tcp_p75 == null ? 0 : Number(r.tcp_p75),
      sslP75: r.ssl_p75 == null ? 0 : Number(r.ssl_p75),
      responseP75: r.response_p75 == null ? 0 : Number(r.response_p75),
      domParseP75: r.dom_parse_p75 == null ? 0 : Number(r.dom_parse_p75),
      resourceLoadP75: r.resource_load_p75 == null ? 0 : Number(r.resource_load_p75),
      sampleCount: Number(r.n),
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

  /**
   * 聚合：按 path 的首屏时间（FMP / FSP）均值 + 完全加载（LCP）均值 + 3s 内打开率
   *
   * 两轮查询：
   *  1) 按 path 聚合 FSP：AVG(value)、3s 内占比、样本数；按 fmp_avg 倒序 LIMIT N
   *  2) 对这 N 个 path 取 LCP 平均值
   *
   * 与 aggregateSlowPages 的差异：此处用 AVG 而非 p75，用 FSP 而非 LCP 作为主排序键；
   * 因为首屏时间面向"页面打开感知"，LCP 则面向"最大元素完成"，两者服务不同视角。
   */
  public async aggregateFmpPages(
    params: WindowParams,
    limit: number,
  ): Promise<FmpPageAggregateRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;

    const fmpRows = await db.execute<{
      path: string;
      n: string | number;
      fmp_avg: string | number | null;
      within3s: string | number | null;
    }>(sql`
      SELECT
        path,
        COUNT(*) AS n,
        AVG(value) AS fmp_avg,
        AVG(CASE WHEN value <= 3000 THEN 1.0 ELSE 0.0 END) AS within3s
      FROM perf_events_raw
      WHERE project_id = ${projectId}
        AND type = 'performance'
        AND metric = 'FSP'
        AND value IS NOT NULL
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY path
      ORDER BY fmp_avg DESC NULLS LAST
      LIMIT ${limit}
    `);

    if (fmpRows.length === 0) return [];

    const paths = fmpRows.map((r) => String(r.path));
    const lcpRows = await db.execute<{
      path: string;
      lcp_avg: string | number | null;
    }>(sql`
      SELECT
        path,
        AVG(value) AS lcp_avg
      FROM perf_events_raw
      WHERE project_id = ${projectId}
        AND type = 'performance'
        AND metric = 'LCP'
        AND value IS NOT NULL
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
        AND path IN (${sql.join(paths.map((p) => sql`${p}`), sql`, `)})
      GROUP BY path
    `);
    const lcpByPath = new Map<string, number>(
      lcpRows.map((r) => [String(r.path), r.lcp_avg == null ? 0 : Number(r.lcp_avg)]),
    );

    return fmpRows.map((r) => ({
      path: String(r.path),
      sampleCount: Number(r.n),
      fmpAvgMs: r.fmp_avg == null ? 0 : Number(r.fmp_avg),
      fullyLoadedAvgMs: lcpByPath.get(String(r.path)) ?? 0,
      within3sRatio: r.within3s == null ? 0 : Number(r.within3s),
    }));
  }

  /**
   * 聚合：按维度（浏览器 / 操作系统 / 设备类型）的样本数 + FMP 均值
   *
   * 当前 perf_events_raw 仅包含 browser / os / device_type 三个维度列；
   * 机型 / 浏览器版本 / OS 版本 / 地域 / 运营商 / 网络均尚未持久化（Phase 2 扩展）。
   *
   * 为避免 SQL 注入，field 走白名单映射到固定的 Drizzle 列，而非字符串拼接。
   */
  public async aggregateDimension(
    params: WindowParams,
    field: DimensionField,
    limit = 10,
  ): Promise<DimensionAggregateRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;

    // field → 列标识（白名单，防注入）
    const column = (() => {
      switch (field) {
        case "browser":
          return sql`browser`;
        case "os":
          return sql`os`;
        case "deviceType":
          return sql`device_type`;
      }
    })();

    // 注意：
    // 1) PostgreSQL 的 GROUP BY 不支持 SELECT 别名（MySQL 支持），必须用列表达式
    // 2) alias 命名避开 `value` —— perf_events_raw 本身有 `value` 列，在 AVG(CASE ...) 内
    //    引用 `value` 必须指向表列而非别名，改名 `dim_value` 消除歧义
    const rows = await db.execute<{
      dim_value: string | null;
      n: string | number;
      fmp_avg: string | number | null;
    }>(sql`
      SELECT
        ${column} AS dim_value,
        COUNT(*) AS n,
        AVG(CASE WHEN metric = 'FSP' THEN value END) AS fmp_avg
      FROM perf_events_raw
      WHERE project_id = ${projectId}
        AND type = 'performance'
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
        AND ${column} IS NOT NULL
      GROUP BY ${column}
      ORDER BY n DESC
      LIMIT ${limit}
    `);

    return rows.map((r) => ({
      value: r.dim_value == null ? "unknown" : String(r.dim_value),
      sampleCount: Number(r.n),
      fmpAvgMs: r.fmp_avg == null ? 0 : Math.round(Number(r.fmp_avg)),
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
