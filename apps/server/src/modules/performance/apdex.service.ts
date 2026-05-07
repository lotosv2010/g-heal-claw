import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { sql } from "drizzle-orm";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";
import { DatabaseService } from "../../shared/database/database.service.js";
import { perfEventsRaw } from "../../shared/database/schema.js";
import { MetricMinuteService } from "./metric-minute.service.js";

/**
 * ApdexService（T2.1.5 / ADR-0037）
 *
 * 每分钟从 perf_events_raw 取上一分钟窗口内指定 metric 的样本，
 * 按项目计算 Apdex 评分并 UPSERT 到 metric_minute(metric='apdex')。
 *
 * Apdex = (satisfied + tolerating/2) / total
 * - Satisfied: value ≤ T
 * - Tolerating: T < value ≤ 4T
 * - Frustrated: value > 4T
 */
@Injectable()
export class ApdexService {
  private readonly logger = new Logger(ApdexService.name);

  public constructor(
    private readonly database: DatabaseService,
    private readonly metricMinute: MetricMinuteService,
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
  ) {}

  @Cron("*/1 * * * *", { name: "apdex-eval" })
  public async evaluate(): Promise<void> {
    if (!this.env.APDEX_CRON) return;

    const db = this.database.db;
    if (!db) return;

    const threshold = this.env.APDEX_THRESHOLD_MS;
    const metric = this.env.APDEX_METRIC;

    // 上一整分钟窗口
    const now = new Date();
    const bucketEnd = new Date(now);
    bucketEnd.setSeconds(0, 0);
    const bucketStart = new Date(bucketEnd.getTime() - 60_000);

    const startMs = bucketStart.getTime();
    const endMs = bucketEnd.getTime();

    // 按 project_id 聚合 satisfied / tolerating / frustrated
    const rows = await db
      .select({
        projectId: perfEventsRaw.projectId,
        satisfied: sql<number>`count(*) filter (where ${perfEventsRaw.value} <= ${threshold})`.as("satisfied"),
        tolerating: sql<number>`count(*) filter (where ${perfEventsRaw.value} > ${threshold} and ${perfEventsRaw.value} <= ${threshold * 4})`.as("tolerating"),
        frustrated: sql<number>`count(*) filter (where ${perfEventsRaw.value} > ${threshold * 4})`.as("frustrated"),
      })
      .from(perfEventsRaw)
      .where(
        sql`${perfEventsRaw.metric} = ${metric} AND ${perfEventsRaw.tsMs} >= ${startMs} AND ${perfEventsRaw.tsMs} < ${endMs}`,
      )
      .groupBy(perfEventsRaw.projectId);

    if (rows.length === 0) {
      this.logger.debug(`apdex: no samples in [${bucketStart.toISOString()}, ${bucketEnd.toISOString()})`);
      return;
    }

    for (const row of rows) {
      const total = row.satisfied + row.tolerating + row.frustrated;
      if (total === 0) continue;

      const score = (row.satisfied + row.tolerating / 2) / total;

      await this.metricMinute.upsertApdex({
        projectId: row.projectId,
        bucketTs: bucketStart,
        satisfied: row.satisfied,
        tolerating: row.tolerating,
        frustrated: row.frustrated,
        score: Math.round(score * 1000) / 1000,
      });
    }

    this.logger.log(`apdex: evaluated ${rows.length} project(s) for [${bucketStart.toISOString()}]`);
  }
}
