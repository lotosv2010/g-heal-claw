import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
} from "@nestjs/common";
import { Cron, SchedulerRegistry } from "@nestjs/schedule";
import { sql } from "drizzle-orm";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";
import { DatabaseService } from "../../shared/database/database.service.js";

/**
 * events_raw 分区维护（TM.E.5 / ADR-0026）
 *
 * 策略：
 *  - 启动时立即 tick 一次：保证服务重启后快速收敛，无需等到下一个 cron 周期
 *  - cron 周期：默认每周一 03:00（由 @Cron 常量标注；env 仅供观测，不支持运行时热改）
 *  - 每次 tick 确保 "今天 + 未来 LOOKAHEAD_WEEKS 周" 的分区都存在
 *  - CREATE TABLE IF NOT EXISTS 天然幂等，多节点同时执行也安全
 *
 * 若需覆盖默认 cron 表达式，可在 onModuleInit 中读取 env.PARTITION_MAINTENANCE_CRON
 * 并通过 SchedulerRegistry 动态注册；本实现优先采用声明式 @Cron。
 *
 * NODE_ENV=test 时短路（不触发 DB，且 @Cron 调用也被 ScheduleModule 跳过）。
 */
@Injectable()
export class PartitionMaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(PartitionMaintenanceService.name);
  /** 未来保留周数：当前周 + 8 周（≥ 2 个月缓冲，规避单次失败导致的断档）*/
  private static readonly LOOKAHEAD_WEEKS = 8;

  public constructor(
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    private readonly database: DatabaseService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  public onModuleInit(): void {
    if (this.env.NODE_ENV === "test") {
      this.logger.log("NODE_ENV=test，跳过分区维护启动 tick");
      return;
    }

    // 启动即运行一次（非阻塞：失败仅记日志，不影响 server 启动）
    void this.ensurePartitions().catch((err: unknown) => {
      this.logger.error(
        `启动分区维护失败：${(err as Error).message}`,
      );
    });

    this.logger.log(
      `分区维护 cron 已装载：${this.env.PARTITION_MAINTENANCE_CRON}（默认 0 3 * * 1）`,
    );
  }

  /**
   * 声明式 cron：默认每周一 03:00（UTC）
   *
   * 实际 env.PARTITION_MAINTENANCE_CRON 生效需改为 SchedulerRegistry 动态注册；
   * 为避免引入 `cron` 直接依赖，本期固定为编译期常量。
   */
  @Cron("0 3 * * 1", { name: "partition-maintenance" })
  public async onCronTick(): Promise<void> {
    try {
      await this.ensurePartitions();
    } catch (err) {
      this.logger.error(
        `分区维护 cron tick 失败：${(err as Error).message}`,
      );
    }
  }

  /**
   * 按 LOOKAHEAD_WEEKS 确保分区存在（对外可测试）
   *
   * 返回实际执行的 CREATE TABLE 语句数量（便于单测断言）
   */
  public async ensurePartitions(now: Date = new Date()): Promise<number> {
    const db = this.database.db;
    if (!db) return 0;

    const monday = toIsoWeekMonday(now);
    let executed = 0;
    for (let i = 0; i <= PartitionMaintenanceService.LOOKAHEAD_WEEKS; i += 1) {
      const start = addDays(monday, i * 7);
      const end = addDays(start, 7);
      const name = weeklyPartitionName(start);
      const startDate = toIsoDate(start);
      const endDate = toIsoDate(end);
      try {
        await db.execute(sql.raw(`
          CREATE TABLE IF NOT EXISTS ${name}
            PARTITION OF events_raw
            FOR VALUES FROM ('${startDate}') TO ('${endDate}');
        `));
        executed += 1;
      } catch (err) {
        this.logger.error(
          `分区创建失败 ${name} [${startDate}, ${endDate}): ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `分区维护完成：检查 ${PartitionMaintenanceService.LOOKAHEAD_WEEKS + 1} 周，执行 ${executed} 条 DDL`,
    );
    return executed;
  }
}

/**
 * ISO 周一起点：把任意日期规整到"该自然周的周一 00:00:00 UTC"
 *
 * 注：采用 ISO 8601（周一为周首），避免 JS Date.getDay() 的周日=0 歧义
 */
export function toIsoWeekMonday(date: Date): Date {
  const d = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
  const day = d.getUTCDay(); // 0=周日, 1=周一, ..., 6=周六
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${date.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 计算分区表名：events_raw_YYYYwNN
 *
 * ISO 周数规则：包含当年首个周四的那一周为第 1 周
 */
export function weeklyPartitionName(monday: Date): string {
  const target = new Date(monday.getTime());
  target.setUTCHours(0, 0, 0, 0);
  // 移到当周的周四（ISO 周基准点）
  target.setUTCDate(target.getUTCDate() + 3 - ((target.getUTCDay() + 6) % 7));
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - yearStart.getTime()) / 86_400_000;
  const weekNum = 1 + Math.round((diff - 3 + ((yearStart.getUTCDay() + 6) % 7)) / 7);
  const year = target.getUTCFullYear();
  const ww = `${weekNum}`.padStart(2, "0");
  return `events_raw_${year}w${ww}`;
}
