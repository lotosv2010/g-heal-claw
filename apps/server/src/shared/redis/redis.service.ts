import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Redis, type Redis as RedisClient } from "ioredis";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";

/**
 * Redis 连接封装
 *
 * - NODE_ENV=test 下跳过真实连接，避免 e2e 强依赖 Redis
 * - lazyConnect=false：启动即建连，避免首次请求延迟
 * - retryStrategy：指数退避（最多 10s），连接丢失不抛 uncaught
 * - 业务侧通过 `client` 访问，需自行判空（与 DatabaseService 对齐）
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private _client: RedisClient | null = null;

  public constructor(@Inject(SERVER_ENV) private readonly env: ServerEnv) {}

  public async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === "test") {
      this.logger.log("NODE_ENV=test，跳过 Redis 初始化");
      return;
    }
    const client = new Redis(this.env.REDIS_URL, {
      retryStrategy: (times: number): number | null => times > 5 ? null : Math.min(times * 200, 5_000),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    this._client = client;
    client.on("error", (err: Error) => {
      this.logger.warn(`Redis 错误：${err.message}`);
    });
    try {
      await client.connect();
      await client.ping();
      this.logger.log(`Redis 已就绪：${maskUrl(this.env.REDIS_URL)}`);
    } catch (err) {
      this.logger.warn(
        `Redis 不可达，降级模式（限流/幂等/实时推送不可用）：${(err as Error).message}`,
      );
      this._client = null;
    }
  }

  public async onModuleDestroy(): Promise<void> {
    if (this._client) {
      await this._client.quit().catch(() => {
        /* 已断开连接时 quit 抛错可忽略 */
      });
      this._client = null;
    }
  }

  /** 获取原生客户端；test 环境 / 未建连返回 null，调用方必须判空 */
  public get client(): RedisClient | null {
    return this._client;
  }
}

function maskUrl(url: string): string {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}
