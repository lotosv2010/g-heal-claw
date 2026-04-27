import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type {
  LongTaskEvent,
  PerformanceEvent,
} from "@g-heal-claw/shared";
import { DatabaseService } from "../shared/database/database.service.js";
import {
  perfEventsRaw,
  type NewPerfEventRow,
} from "../shared/database/schema.js";

export type PerfOrLongTaskEvent = PerformanceEvent | LongTaskEvent;

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
   * 简单总数查询（调试用）；T2.1.6 会替换为带筛选的 Dashboard API
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
