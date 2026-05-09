import { Global, Module, Logger, type DynamicModule } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { Redis } from "ioredis";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";

const logger = new Logger("QueueModule");

/**
 * BullMQ 全局连接模块（Redis 可选）
 *
 * Redis 不可用时 QueueModule 退化为空模块，队列相关功能静默不可用。
 * 不阻塞 server 启动。
 */
@Global()
@Module({})
export class QueueModule {
  static async forRootAsync(): Promise<DynamicModule> {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

    // 预检测 Redis 是否可达
    const reachable = await checkRedis(redisUrl);
    if (!reachable) {
      logger.warn("Redis 不可达，BullMQ 队列功能不可用（server 继续启动）");
      return {
        module: QueueModule,
        imports: [],
        exports: [],
      };
    }

    return {
      module: QueueModule,
      imports: [
        BullModule.forRootAsync({
          inject: [SERVER_ENV],
          useFactory: (env: ServerEnv) => ({
            connection: {
              url: env.REDIS_URL,
              maxRetriesPerRequest: null,
            },
            defaultJobOptions: {
              removeOnComplete: { count: 1000 },
              removeOnFail: { count: 5000 },
            },
          }),
        }),
      ],
      exports: [BullModule],
    };
  }
}

async function checkRedis(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = new Redis(url, {
      connectTimeout: 2000,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
      lazyConnect: true,
    });
    client.on("error", () => {});
    client.connect()
      .then(() => { client.quit(); resolve(true); })
      .catch(() => { resolve(false); });
    setTimeout(() => { client.disconnect(); resolve(false); }, 2000);
  });
}
