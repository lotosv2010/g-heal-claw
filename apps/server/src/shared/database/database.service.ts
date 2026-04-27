import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";
import { PERFORMANCE_DDL } from "./ddl.js";
import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * PostgreSQL 连接 + Drizzle 实例（ADR-0013）
 *
 * - NODE_ENV=test 下跳过真实连接，避免 e2e 依赖本地 DB
 * - onModuleInit：建连接 → 执行幂等 DDL；失败抛出以阻止 server 启动带错误状态运行
 * - onModuleDestroy：优雅关闭连接池
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private sql: Sql | null = null;
  private _db: Database | null = null;

  public constructor(
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === "test") {
      this.logger.log("NODE_ENV=test，跳过数据库初始化");
      return;
    }
    this.sql = postgres(this.env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      onnotice: () => {
        // 静默 PostgreSQL NOTICE（如 "relation already exists, skipping"）
      },
    });
    this._db = drizzle(this.sql, { schema });
    try {
      await this.applyDdl();
    } catch (err) {
      this.reportFatal(err);
      // 连接/建表失败视为启动期配置问题；与 loadServerEnv 保持一致的退出语义
      process.exit(1);
    }
    this.logger.log(`数据库已就绪：${this.maskUrl(this.env.DATABASE_URL)}`);
  }

  /**
   * 友好打印启动期数据库错误
   *
   * 针对最常见的 `3D000 数据库不存在` / `28P01 密码错误` / `ECONNREFUSED`
   * 给出下一步操作建议，避免用户陷入原始 stack 排查。
   */
  private reportFatal(err: unknown): void {
    const masked = this.maskUrl(this.env.DATABASE_URL);
    const code = (err as { code?: string } | null)?.code;
    const message = (err as Error | null)?.message ?? String(err);

    // eslint-disable-next-line no-console
    console.error(`\n[DatabaseService] 连接或建表失败：${masked}`);
    // eslint-disable-next-line no-console
    console.error(`  code=${code ?? "unknown"}  message=${message}`);

    const hints: Record<string, string> = {
      "3D000":
        "数据库不存在。请先在目标 PostgreSQL 实例手工创建：\n" +
        `    psql -h 127.0.0.1 -U postgres -d postgres -c 'CREATE DATABASE "${this.env.POSTGRES_DB}";'`,
      "28P01": "密码错误。请检查 .env(.local) 中的 POSTGRES_PASSWORD / DATABASE_URL。",
      "28000":
        "认证方式不被允许。请检查 pg_hba.conf 是否放开了该账号的 host 登录。",
      ECONNREFUSED:
        "连接被拒绝。请确认 PostgreSQL 已启动，且 Host/Port 与 DATABASE_URL 一致。",
    };
    const hint = code ? hints[code] : undefined;
    if (hint) {
      // eslint-disable-next-line no-console
      console.error(`\n  → ${hint}\n`);
    } else {
      // eslint-disable-next-line no-console
      console.error("");
    }
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.sql) {
      await this.sql.end({ timeout: 5 });
      this.sql = null;
      this._db = null;
    }
  }

  /**
   * 获取 Drizzle 实例（业务 Service 唯一入口）
   *
   * test 环境下返回 null，调用方必须自行短路或使用 mock。
   */
  public get db(): Database | null {
    return this._db;
  }

  private async applyDdl(): Promise<void> {
    if (!this.sql) return;
    for (const stmt of PERFORMANCE_DDL) {
      await this.sql.unsafe(stmt);
    }
    this.logger.log(`DDL 执行完成（${PERFORMANCE_DDL.length} 条语句）`);
  }

  /** 屏蔽密码，仅用于启动日志 */
  private maskUrl(url: string): string {
    return url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
  }
}
