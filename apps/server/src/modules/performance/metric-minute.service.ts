import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { PerformanceEvent } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import { metricMinute } from "../../shared/database/schema.js";
import type { PerfOrLongTaskEvent } from "./performance.service.js";

/**
 * MetricMinuteService（T2.1.4.3 / ADR-0037）
 *
 * 按 (projectId, metric, minuteBucket) 聚合性能事件百分位，UPSERT 到 metric_minute 表。
 * 百分位使用排序法精确计算（每分钟样本量通常 < 1000，可接受）。
 */
@Injectable()
export class MetricMinuteService {
  private readonly logger = new Logger(MetricMinuteService.name);

  public constructor(private readonly database: DatabaseService) {}

  /**
   * 将一批事件按 (projectId, metric, minute) 分组聚合，UPSERT 到 metric_minute
   */
  public async aggregateAndUpsert(events: readonly PerfOrLongTaskEvent[]): Promise<void> {
    // 仅聚合有 metric + value 的 performance 事件（过滤 long_task）
    const perfEvents = events.filter(
      (e): e is PerformanceEvent => e.type === "performance" && e.metric != null && e.value != null,
    );
    if (perfEvents.length === 0) return;

    const buckets = groupByBucket(perfEvents);

    const db = this.database.db;
    if (!db) return;

    for (const [key, values] of buckets.entries()) {
      const [projectId, metric, bucketTs] = key.split("|");
      const sorted = values.sort((a, b) => a - b);
      const count = sorted.length;
      const sum = sorted.reduce((acc, v) => acc + v, 0);

      await db
        .insert(metricMinute)
        .values({
          projectId,
          metric,
          bucketTs: new Date(bucketTs),
          p50: percentile(sorted, 0.5),
          p75: percentile(sorted, 0.75),
          p90: percentile(sorted, 0.9),
          p95: percentile(sorted, 0.95),
          p99: percentile(sorted, 0.99),
          count,
          sum,
        })
        .onConflictDoUpdate({
          target: [metricMinute.projectId, metricMinute.metric, metricMinute.bucketTs],
          set: {
            p50: sql`excluded.p50`,
            p75: sql`excluded.p75`,
            p90: sql`excluded.p90`,
            p95: sql`excluded.p95`,
            p99: sql`excluded.p99`,
            count: sql`excluded.count`,
            sum: sql`excluded.sum`,
          },
        });
    }

    this.logger.debug(`upserted ${buckets.size} metric_minute rows`);
  }

  /**
   * Apdex UPSERT（由 ApdexService 调用）
   */
  public async upsertApdex(params: {
    projectId: string;
    bucketTs: Date;
    satisfied: number;
    tolerating: number;
    frustrated: number;
    score: number;
  }): Promise<void> {
    const db = this.database.db;
    if (!db) return;

    await db
      .insert(metricMinute)
      .values({
        projectId: params.projectId,
        metric: "apdex",
        bucketTs: params.bucketTs,
        p75: params.score,
        count: params.satisfied + params.tolerating + params.frustrated,
        satisfied: params.satisfied,
        tolerating: params.tolerating,
        frustrated: params.frustrated,
      })
      .onConflictDoUpdate({
        target: [metricMinute.projectId, metricMinute.metric, metricMinute.bucketTs],
        set: {
          p75: sql`excluded.p75`,
          count: sql`excluded.count`,
          satisfied: sql`excluded.satisfied`,
          tolerating: sql`excluded.tolerating`,
          frustrated: sql`excluded.frustrated`,
        },
      });
  }
}

/** 按 "projectId|metric|minuteBucket" 分组，收集 value 数组 */
function groupByBucket(events: readonly PerformanceEvent[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const event of events) {
    const minute = new Date(event.timestamp);
    minute.setSeconds(0, 0);
    const key = `${event.projectId}|${event.metric}|${minute.toISOString()}`;
    const arr = map.get(key);
    if (arr) {
      arr.push(event.value);
    } else {
      map.set(key, [event.value]);
    }
  }
  return map;
}

/** 从已排序数组计算百分位（线性插值） */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}
