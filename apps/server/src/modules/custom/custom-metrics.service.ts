import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { CustomMetric } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import {
  customMetricsRaw,
  type NewCustomMetricRow,
} from "../../shared/database/schema.js";
import type { CustomWindowParams } from "./custom-events.service.js";

export interface CustomMetricsSummaryRow {
  readonly totalSamples: number;
  readonly distinctNames: number;
  readonly globalP75: number;
  readonly globalP95: number;
}

export interface CustomMetricTopRow {
  readonly name: string;
  readonly count: number;
  readonly p50: number;
  readonly p75: number;
  readonly p95: number;
  readonly avgDurationMs: number;
}

export interface CustomMetricTrendRow {
  readonly hour: string;
  readonly count: number;
  readonly avgDurationMs: number;
}

/**
 * 自定义业务测速（type='custom_metric'）落库 + 聚合服务（ADR-0023 §4）
 */
@Injectable()
export class CustomMetricsService {
  private readonly logger = new Logger(CustomMetricsService.name);

  public constructor(private readonly database: DatabaseService) {}

  public async saveBatch(events: readonly CustomMetric[]): Promise<number> {
    if (events.length === 0) return 0;
    const db = this.database.db;
    if (!db) return 0;
    const rows = events.map(toRow);
    try {
      const inserted = await db
        .insert(customMetricsRaw)
        .values(rows)
        .onConflictDoNothing({ target: customMetricsRaw.eventId })
        .returning({ id: customMetricsRaw.id });
      return inserted.length;
    } catch (err) {
      this.logger.error(
        `custom_metric 写入失败：${(err as Error).message}`,
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
      .from(customMetricsRaw)
      .where(sql`${customMetricsRaw.projectId} = ${projectId}`);
    return result[0]?.c ?? 0;
  }

  public async aggregateSummary(
    params: CustomWindowParams,
  ): Promise<CustomMetricsSummaryRow> {
    const db = this.database.db;
    const empty: CustomMetricsSummaryRow = {
      totalSamples: 0,
      distinctNames: 0,
      globalP75: 0,
      globalP95: 0,
    };
    if (!db) return empty;
    const { projectId, sinceMs, untilMs } = params;
    const rows = await db.execute<{
      total: string | number;
      names: string | number;
      p75: string | number | null;
      p95: string | number | null;
    }>(sql`
      SELECT
        COUNT(*)                                                   AS total,
        COUNT(DISTINCT name)                                       AS names,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY duration_ms)  AS p75,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)  AS p95
      FROM custom_metrics_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
    `);
    const first = rows[0];
    if (!first) return empty;
    return {
      totalSamples: Number(first.total),
      distinctNames: Number(first.names),
      globalP75: first.p75 == null ? 0 : Number(first.p75),
      globalP95: first.p95 == null ? 0 : Number(first.p95),
    };
  }

  public async aggregateTopMetrics(
    params: CustomWindowParams,
    limit: number,
  ): Promise<CustomMetricTopRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const clamped = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await db.execute<{
      name: string;
      n: string | number;
      p50: string | number | null;
      p75: string | number | null;
      p95: string | number | null;
      avg: string | number | null;
    }>(sql`
      SELECT
        name,
        COUNT(*)                                                   AS n,
        percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)  AS p50,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY duration_ms)  AS p75,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)  AS p95,
        AVG(duration_ms)                                           AS avg
      FROM custom_metrics_raw
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ts_ms <  ${untilMs}
      GROUP BY name
      ORDER BY p75 DESC NULLS LAST, name ASC
      LIMIT ${clamped}
    `);
    return rows.map((r) => ({
      name: String(r.name),
      count: Number(r.n),
      p50: r.p50 == null ? 0 : Number(r.p50),
      p75: r.p75 == null ? 0 : Number(r.p75),
      p95: r.p95 == null ? 0 : Number(r.p95),
      avgDurationMs: r.avg == null ? 0 : Number(r.avg),
    }));
  }

  public async aggregateTrend(
    params: CustomWindowParams,
  ): Promise<CustomMetricTrendRow[]> {
    const db = this.database.db;
    if (!db) return [];
    const { projectId, sinceMs, untilMs } = params;
    const trunc = params.granularity === "day"
      ? sql`date_trunc('day', to_timestamp(ts_ms / 1000.0))`
      : sql`date_trunc('hour', to_timestamp(ts_ms / 1000.0))`;
    const rows = await db.execute<{
      hour: Date | string;
      n: string | number;
      avg: string | number | null;
    }>(sql`
      SELECT
        ${trunc}                                          AS hour,
        COUNT(*)                                          AS n,
        AVG(duration_ms)                                  AS avg
      FROM custom_metrics_raw
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
      avgDurationMs: r.avg == null ? 0 : Number(r.avg),
    }));
  }
}

function toRow(e: CustomMetric): NewCustomMetricRow {
  return {
    eventId: e.eventId,
    projectId: e.projectId,
    publicKey: e.publicKey,
    sessionId: e.sessionId ?? "",
    tsMs: e.timestamp,
    name: (e.name ?? "").slice(0, 128),
    durationMs: e.duration,
    properties: (e.properties ?? null) as Record<string, unknown> | null,
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
