import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DatabaseService } from "../../shared/database/database.service.js";
import type {
  IssueDetailDto,
  IssueEventDto,
  IssueListItemDto,
  IssuesListQuery,
} from "../dto/issues.dto.js";

/**
 * Dashboard Issues 列表/详情服务
 *
 * 直查 issues 表 + error_events_raw 关联查询
 */
@Injectable()
export class DashboardIssuesService {
  private readonly logger = new Logger(DashboardIssuesService.name);

  public constructor(private readonly database: DatabaseService) {}

  public async list(
    query: IssuesListQuery,
  ): Promise<{ items: IssueListItemDto[]; total: number }> {
    const db = this.database.db;
    if (!db) return { items: [], total: 0 };

    const { projectId, status, subType, sort, order, page, limit } = query;

    const conditions = [sql`project_id = ${projectId}`];
    if (status) conditions.push(sql`status = ${status}`);
    if (subType) conditions.push(sql`sub_type = ${subType}`);

    const where = sql.join(conditions, sql` AND `);

    const sortCol =
      sort === "event_count"
        ? sql`event_count`
        : sort === "first_seen"
          ? sql`first_seen`
          : sql`last_seen`;
    const dir = order === "asc" ? sql`ASC` : sql`DESC`;
    const offset = (page - 1) * limit;

    const [countResult, rows] = await Promise.all([
      db.execute<{ cnt: string | number }>(
        sql`SELECT COUNT(*) AS cnt FROM issues WHERE ${where}`,
      ),
      db.execute<{
        id: string;
        fingerprint: string;
        sub_type: string;
        title: string;
        level: string;
        status: string;
        first_seen: string;
        last_seen: string;
        event_count: string | number;
        impacted_sessions: string | number;
        assigned_user_id: string | null;
      }>(sql`
        SELECT id, fingerprint, sub_type, title, level, status,
               first_seen, last_seen, event_count, impacted_sessions, assigned_user_id
        FROM issues
        WHERE ${where}
        ORDER BY ${sortCol} ${dir}
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);

    const total = Number(countResult[0]?.cnt ?? 0);
    const items: IssueListItemDto[] = rows.map((r) => ({
      id: r.id,
      fingerprint: r.fingerprint,
      subType: r.sub_type,
      title: r.title,
      level: r.level,
      status: r.status,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      eventCount: Number(r.event_count),
      impactedSessions: Number(r.impacted_sessions),
      assignedUserId: r.assigned_user_id,
    }));

    return { items, total };
  }

  public async getDetail(
    issueId: string,
    projectId: string,
  ): Promise<IssueDetailDto | null> {
    const db = this.database.db;
    if (!db) return null;

    const issueRows = await db.execute<{
      id: string;
      fingerprint: string;
      sub_type: string;
      title: string;
      level: string;
      status: string;
      first_seen: string;
      last_seen: string;
      event_count: string | number;
      impacted_sessions: string | number;
      assigned_user_id: string | null;
    }>(sql`
      SELECT id, fingerprint, sub_type, title, level, status,
             first_seen, last_seen, event_count, impacted_sessions, assigned_user_id
      FROM issues
      WHERE id = ${issueId} AND project_id = ${projectId}
      LIMIT 1
    `);

    const issue = issueRows[0];
    if (!issue) return null;

    const eventRows = await db.execute<{
      event_id: string;
      ts_ms: string | number;
      message: string;
      stack: string | null;
      url: string | null;
      browser: string | null;
      os: string | null;
      device_type: string | null;
      environment: string | null;
      session_id: string;
    }>(sql`
      SELECT event_id, ts_ms, message, stack, url, browser, os,
             device_type, environment, session_id
      FROM error_events_raw
      WHERE project_id = ${projectId}
        AND sub_type = ${issue.sub_type}
        AND message_head = ${issue.title.slice(0, 128)}
      ORDER BY ts_ms DESC
      LIMIT 10
    `);

    const recentEvents: IssueEventDto[] = eventRows.map((e) => ({
      eventId: e.event_id,
      timestamp: new Date(Number(e.ts_ms)).toISOString(),
      message: e.message,
      stack: e.stack,
      url: e.url,
      browser: e.browser,
      os: e.os,
      deviceType: e.device_type,
      environment: e.environment,
      sessionId: e.session_id,
    }));

    return {
      id: issue.id,
      fingerprint: issue.fingerprint,
      subType: issue.sub_type,
      title: issue.title,
      level: issue.level,
      status: issue.status,
      firstSeen: issue.first_seen,
      lastSeen: issue.last_seen,
      eventCount: Number(issue.event_count),
      impactedSessions: Number(issue.impacted_sessions),
      assignedUserId: issue.assigned_user_id,
      recentEvents,
    };
  }

  public async updateStatus(
    issueId: string,
    projectId: string,
    status: string,
  ): Promise<boolean> {
    const db = this.database.db;
    if (!db) return false;

    const resolvedAt =
      status === "resolved" ? sql`now()` : sql`NULL`;

    const rows = await db.execute<{ id: string }>(sql`
      UPDATE issues
      SET status = ${status},
          resolved_at = ${resolvedAt}
      WHERE id = ${issueId}
        AND project_id = ${projectId}
      RETURNING id
    `);
    return rows.length > 0;
  }
}
