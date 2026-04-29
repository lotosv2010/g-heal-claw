import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { SdkEvent } from "@g-heal-claw/shared";
import { DatabaseService } from "../shared/database/database.service.js";

/**
 * DLQ 失败阶段：用于后续补偿时按阶段分流（raw-insert / issues-upsert / decode-fail / ...）
 */
export type DlqStage =
  | "error-raw-insert"
  | "perf-raw-insert"
  | "issues-upsert"
  | "decode-fail";

/** 单条 DLQ 条目输入 */
export interface DlqEntry {
  readonly eventId: string | null;
  readonly projectId: string | null;
  readonly eventType: string;
  readonly stage: DlqStage;
  readonly reason: string;
  readonly payload: unknown;
}

/**
 * 死信队列服务（T1.4.4 / ADR-0016 §5）
 *
 * 设计取舍：
 *  - 本期无 BullMQ，DLQ 存储退到 Postgres 单表，写入走 INSERT 即可
 *  - 写入失败不抛错：DLQ 本身是兜底，自身失败只记告警日志，避免级联故障
 *  - 告警语义：WARN 级日志 + 结构化字段，等 M4 告警引擎接入 Slack/钉钉时再升级
 *  - Test 环境（db=null）静默 no-op
 */
@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  public constructor(private readonly database: DatabaseService) {}

  /**
   * 批量入库（单事务视角；单条失败不影响其他条目的落库，由 Postgres 行级语义保证）
   *
   * 返回实际入库行数；0 表示全部失败或 db=null。
   */
  public async enqueue(entries: readonly DlqEntry[]): Promise<number> {
    if (entries.length === 0) return 0;
    const db = this.database.db;
    if (!db) return 0;

    let inserted = 0;
    for (const entry of entries) {
      try {
        await db.execute(sql`
          INSERT INTO events_dlq (
            event_id, project_id, event_type, stage, reason, payload
          )
          VALUES (
            ${entry.eventId},
            ${entry.projectId},
            ${entry.eventType},
            ${entry.stage},
            ${entry.reason},
            ${JSON.stringify(entry.payload ?? null)}::jsonb
          )
        `);
        inserted += 1;
        // 结构化告警：统一 key 便于日志聚合
        this.logger.warn(
          `DLQ ingested stage=${entry.stage} event_type=${entry.eventType} ` +
            `project_id=${entry.projectId ?? "-"} event_id=${entry.eventId ?? "-"} ` +
            `reason=${truncate(entry.reason, 200)}`,
        );
      } catch (err) {
        // DLQ 自身失败：只记日志不抛错（兜底链路不能再级联崩溃）
        this.logger.error(
          `DLQ 写入失败 stage=${entry.stage} event_id=${entry.eventId}: ${(err as Error).message}`,
        );
      }
    }
    return inserted;
  }

  /** 便捷方法：把整批事件打成 DLQ 条目入库（stage/reason 复用） */
  public async enqueueEvents(
    events: readonly SdkEvent[],
    stage: DlqStage,
    reason: string,
  ): Promise<number> {
    const entries = events.map<DlqEntry>((ev) => ({
      eventId: ev.eventId,
      projectId: ev.projectId,
      eventType: ev.type,
      stage,
      reason,
      payload: ev,
    }));
    return this.enqueue(entries);
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
