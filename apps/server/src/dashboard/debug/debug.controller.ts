import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { DatabaseService } from "../../shared/database/database.service.js";
import { sql } from "drizzle-orm";

/**
 * 调试控制器 - 仅用于开发环境排查数据问题
 */
@ApiTags("debug")
@Controller("debug/v1")
export class DebugController {
  public constructor(private readonly database: DatabaseService) {}

  @Get("events/count")
  @ApiOperation({ summary: "统计各项目的事件数量" })
  public async countEvents(@Query("projectId") projectId?: string) {
    const db = this.database.db;
    if (!db) return { error: "数据库不可用" };

    try {
      const rows = await db.execute<{
        project_id: string;
        event_count: string | number;
        earliest_ts: string | number;
        latest_ts: string | number;
      }>(sql`
        SELECT
          project_id,
          COUNT(*) as event_count,
          MIN(ts_ms) as earliest_ts,
          MAX(ts_ms) as latest_ts
        FROM error_events_raw
        ${projectId ? sql`WHERE project_id = ${projectId}` : sql``}
        GROUP BY project_id
      `);

      return {
        data: rows.map((r) => ({
          projectId: r.project_id,
          eventCount: Number(r.event_count),
          earliestTs: Number(r.earliest_ts),
          latestTs: Number(r.latest_ts),
          earliestTime: new Date(Number(r.earliest_ts)).toISOString(),
          latestTime: new Date(Number(r.latest_ts)).toISOString(),
        })),
      };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  @Get("events/window")
  @ApiOperation({ summary: "检查时间窗口内的事件" })
  public async checkWindow(
    @Query("projectId") projectId: string = "demo",
    @Query("windowHours") windowHours: string = "24",
  ) {
    const db = this.database.db;
    if (!db) return { error: "数据库不可用" };

    const now = Date.now();
    const windowMs = Number(windowHours) * 3600_000;
    const sinceMs = now - windowMs;

    try {
      const rows = await db.execute<{
        count: string | number;
        sessions: string | number;
      }>(sql`
        SELECT
          COUNT(*) as count,
          COUNT(DISTINCT session_id) as sessions
        FROM error_events_raw
        WHERE project_id = ${projectId}
          AND ts_ms >= ${sinceMs}
          AND ts_ms < ${now}
      `);

      return {
        query: {
          projectId,
          windowHours: Number(windowHours),
          sinceMs,
          untilMs: now,
          sinceTime: new Date(sinceMs).toISOString(),
          untilTime: new Date(now).toISOString(),
        },
        result: {
          eventCount: Number(rows[0]?.count ?? 0),
          uniqueSessions: Number(rows[0]?.sessions ?? 0),
        },
      };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  @Get("events/recent")
  @ApiOperation({ summary: "查看最近的事件" })
  public async recentEvents(
    @Query("projectId") projectId: string = "demo",
    @Query("limit") limit: string = "5",
  ) {
    const db = this.database.db;
    if (!db) return { error: "数据库不可用" };

    try {
      const rows = await db.execute<{
        project_id: string;
        ts_ms: string | number;
        sub_type: string;
        message: string;
        environment: string | null;
      }>(sql`
        SELECT project_id, ts_ms, sub_type, message, environment
        FROM error_events_raw
        WHERE project_id = ${projectId}
        ORDER BY ts_ms DESC
        LIMIT ${Number(limit)}
      `);

      return {
        data: rows.map((r) => ({
          projectId: r.project_id,
          tsMs: Number(r.ts_ms),
          time: new Date(Number(r.ts_ms)).toISOString(),
          subType: r.sub_type,
          message: r.message,
          environment: r.environment,
        })),
      };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }
}
