import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { SERVER_ENV, type ServerEnv } from "../config/env.js";
import { DatabaseService } from "../shared/database/database.service.js";
import { IssueUserHllService } from "./hll.service.js";

/**
 * Issue HLL 回写 cron（T1.4.3 / ADR-0016 §3.4）
 *
 * 目的：写入路径仅能累加"本批 session 集合大小"作为 lower-bound；
 * 本服务定期把 Redis HLL 的精确估算值写回 `issues.impacted_sessions`。
 *
 * 策略：
 * - 每 `ISSUE_HLL_BACKFILL_INTERVAL_MS` 扫描 last_seen 在最近 30min 的活跃 Issue
 * - PFCOUNT 拿到估算值 → 若 > 现值，UPDATE；否则保留（HLL 只增不减）
 * - Redis 缺席 / DB 缺席 / Interval=0 → 整体禁用，零副作用
 *
 * 与 IssuesService.upsertBatch 并不抢锁：UPSERT 用 impacted_sessions + EXCLUDED
 * 语义，cron 只做 set 到更大值，双向收敛最终一致。
 */
@Injectable()
export class IssueHllBackfillService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(IssueHllBackfillService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly database: DatabaseService,
    private readonly hll: IssueUserHllService,
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
  ) {}

  public onModuleInit(): void {
    if (this.env.NODE_ENV === "test") return;
    const interval = this.env.ISSUE_HLL_BACKFILL_INTERVAL_MS;
    if (interval === 0) {
      this.logger.log("ISSUE_HLL_BACKFILL_INTERVAL_MS=0，跳过 HLL 回写 cron");
      return;
    }
    // 首次延后 10s 等 DB / Redis 就绪；之后按 interval 周期
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);
    // Node 的 unref 让进程不被 cron 阻塞退出
    this.timer.unref?.();
    this.logger.log(`HLL 回写 cron 启动：${interval}ms / ${this.env.ISSUE_HLL_BACKFILL_BATCH} 行/轮`);
  }

  public onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 单次扫描（public 便于测试直接触发） */
  public async tick(): Promise<{ scanned: number; updated: number }> {
    if (this.running) return { scanned: 0, updated: 0 };
    this.running = true;
    try {
      return await this.runOnce();
    } catch (err) {
      this.logger.warn(`HLL 回写失败：${(err as Error).message}`);
      return { scanned: 0, updated: 0 };
    } finally {
      this.running = false;
    }
  }

  private async runOnce(): Promise<{ scanned: number; updated: number }> {
    const db = this.database.db;
    if (!db) return { scanned: 0, updated: 0 };

    const batch = this.env.ISSUE_HLL_BACKFILL_BATCH;
    // 仅扫描最近 30min 有新事件的 open/ignored Issue；resolved 不回写避免反复触发
    const rows = await db.execute<{
      id: string;
      project_id: string;
      fingerprint: string;
      impacted_sessions: string | number;
    }>(sql`
      SELECT id, project_id, fingerprint, impacted_sessions
      FROM issues
      WHERE status IN ('open', 'ignored')
        AND last_seen >= now() - interval '30 minutes'
      ORDER BY last_seen DESC
      LIMIT ${batch}
    `);

    let updated = 0;
    for (const row of rows) {
      const current = Number(row.impacted_sessions) || 0;
      const estimate = await this.hll.pfCount(row.project_id, row.fingerprint);
      if (estimate == null) continue;
      if (estimate <= current) continue;
      try {
        await db.execute(sql`
          UPDATE issues
          SET impacted_sessions = ${estimate}
          WHERE id = ${row.id}
            AND impacted_sessions < ${estimate}
        `);
        updated += 1;
      } catch (err) {
        this.logger.warn(
          `回写 issues.impacted_sessions 失败 id=${row.id}：${
            (err as Error).message
          }`,
        );
      }
    }
    if (rows.length > 0) {
      this.logger.debug(
        `HLL 回写：扫描 ${rows.length} / 更新 ${updated}`,
      );
    }
    return { scanned: rows.length, updated };
  }
}
