import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { ErrorEvent } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import { buildIssueTitle, computeFingerprint } from "./fingerprint.js";

/**
 * 单次 UPSERT 的聚合输入（同一批内合并同指纹事件）
 */
interface IssueAggregate {
  readonly projectId: string;
  readonly fingerprint: string;
  readonly subType: string;
  readonly title: string;
  readonly eventCount: number;
  readonly firstSeenMs: number;
  readonly lastSeenMs: number;
  /** 影响会话：本批内去重后的 session_id 数；不跨批次合并，作 lower-bound */
  readonly sessionIds: ReadonlySet<string>;
}

/**
 * UPSERT 结果（便于日志 + 测试断言）
 */
export interface UpsertResult {
  readonly inserted: number;
  readonly updated: number;
  readonly reopened: number;
}

/**
 * 异常聚合 Service（ADR-0016 §3 / ADR-0017 §3.7；T1.4.1）
 *
 * 职责：按指纹把同一批 ErrorEvent[] 聚合为 issues 行的 UPSERT
 *  - 新建：INSERT 新行（status='open', first_seen=now, event_count=N）
 *  - 命中：UPDATE last_seen=now, event_count += N, impacted_sessions += batch_sessions
 *  - 状态机 regression：命中行 status='resolved' + 新事件 → 自动回归 'open' 并清 resolved_at
 *
 * 本期范围：在 ErrorsService.saveBatch 内联同步调用（无队列；BullMQ 改造延后至 T1.4.4 DLQ 之后）
 */
@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  public constructor(private readonly database: DatabaseService) {}

  /**
   * 聚合 UPSERT 一批错误事件
   *
   * 幂等性：ON CONFLICT (project_id, fingerprint) UPDATE；同批多事件会先合并再写。
   * DB 未就绪 → 短路返回零结构；上层日志层可选打印。
   */
  public async upsertBatch(
    events: readonly ErrorEvent[],
  ): Promise<UpsertResult> {
    if (events.length === 0) {
      return { inserted: 0, updated: 0, reopened: 0 };
    }
    const db = this.database.db;
    if (!db) return { inserted: 0, updated: 0, reopened: 0 };

    const aggregates = aggregate(events);
    let inserted = 0;
    let updated = 0;
    let reopened = 0;

    for (const agg of aggregates.values()) {
      const result = await this.upsertOne(agg);
      if (result === "inserted") inserted += 1;
      else if (result === "reopened") reopened += 1;
      else updated += 1;
    }

    return { inserted, updated, reopened };
  }

  private async upsertOne(
    agg: IssueAggregate,
  ): Promise<"inserted" | "updated" | "reopened"> {
    const db = this.database.db;
    if (!db) return "updated";

    const newId = `iss_${nanoid(24)}`;
    const firstSeenSec = agg.firstSeenMs / 1000;
    const lastSeenSec = agg.lastSeenMs / 1000;
    const sessionDelta = agg.sessionIds.size;

    // 关键点：RETURNING 同时拿 created_at 与 xmax 无法直接用，改为比较 first_seen 与 last_seen
    // 新插入：first_seen == last_seen（均为本批 firstSeenMs）
    // UPDATE 命中：last_seen 取 GREATEST() 可能上调 → 与 first_seen 分歧
    // reopened 由下面基于 pre_status 的 UPDATE 返回来判定
    const rows = await db.execute<{
      id: string;
      pre_status: string | null;
      status: string;
      event_count: string | number;
      first_seen_iso: string;
      last_seen_iso: string;
    }>(sql`
      WITH prior AS (
        SELECT id, status
        FROM issues
        WHERE project_id = ${agg.projectId}
          AND fingerprint = ${agg.fingerprint}
      )
      INSERT INTO issues (
        id, project_id, fingerprint, sub_type, title,
        level, status, first_seen, last_seen, event_count, impacted_sessions
      )
      VALUES (
        ${newId},
        ${agg.projectId},
        ${agg.fingerprint},
        ${agg.subType},
        ${agg.title},
        'error',
        'open',
        to_timestamp(${firstSeenSec}),
        to_timestamp(${lastSeenSec}),
        ${agg.eventCount},
        ${sessionDelta}
      )
      ON CONFLICT (project_id, fingerprint) DO UPDATE SET
        last_seen = GREATEST(issues.last_seen, EXCLUDED.last_seen),
        event_count = issues.event_count + EXCLUDED.event_count,
        impacted_sessions = issues.impacted_sessions + EXCLUDED.impacted_sessions,
        status = CASE
          WHEN issues.status = 'resolved' THEN 'open'
          ELSE issues.status
        END,
        resolved_at = CASE
          WHEN issues.status = 'resolved' THEN NULL
          ELSE issues.resolved_at
        END,
        title = CASE
          WHEN issues.title = '' THEN EXCLUDED.title
          ELSE issues.title
        END
      RETURNING
        id,
        (SELECT status FROM prior)               AS pre_status,
        status,
        event_count,
        first_seen::text                         AS first_seen_iso,
        last_seen::text                          AS last_seen_iso
    `);

    const row = rows[0];
    if (!row) return "updated";

    if (row.pre_status == null) return "inserted";
    if (row.pre_status === "resolved" && row.status === "open") return "reopened";
    return "updated";
  }

  /**
   * 手工状态迁移：open → resolved；写 resolved_at
   *
   * 状态机简化版：本期仅实现 resolve / reopen 两个方向；ignored 留到 T1.6.x Dashboard 联动。
   */
  public async resolve(issueId: string): Promise<boolean> {
    const db = this.database.db;
    if (!db) return false;
    const rows = await db.execute<{ id: string }>(sql`
      UPDATE issues
      SET status = 'resolved', resolved_at = now()
      WHERE id = ${issueId}
        AND status <> 'resolved'
      RETURNING id
    `);
    return rows.length > 0;
  }

  public async reopen(issueId: string): Promise<boolean> {
    const db = this.database.db;
    if (!db) return false;
    const rows = await db.execute<{ id: string }>(sql`
      UPDATE issues
      SET status = 'open', resolved_at = NULL
      WHERE id = ${issueId}
        AND status = 'resolved'
      RETURNING id
    `);
    return rows.length > 0;
  }
}

/**
 * 批内预聚合：按 (projectId, fingerprint) 合并事件，降低 UPSERT 次数
 */
function aggregate(
  events: readonly ErrorEvent[],
): Map<string, IssueAggregate> {
  const map = new Map<string, IssueAggregate>();
  for (const event of events) {
    const fingerprint = computeFingerprint(event);
    const key = `${event.projectId}:${fingerprint}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        projectId: event.projectId,
        fingerprint,
        subType: event.subType,
        title: buildIssueTitle(event),
        eventCount: 1,
        firstSeenMs: event.timestamp,
        lastSeenMs: event.timestamp,
        sessionIds: new Set([event.sessionId]),
      });
      continue;
    }
    // Set 是 readonly，但 Set 本身可写；这里直接改 existing.sessionIds 的 add
    (existing.sessionIds as Set<string>).add(event.sessionId);
    map.set(key, {
      ...existing,
      eventCount: existing.eventCount + 1,
      firstSeenMs: Math.min(existing.firstSeenMs, event.timestamp),
      lastSeenMs: Math.max(existing.lastSeenMs, event.timestamp),
    });
  }
  return map;
}
