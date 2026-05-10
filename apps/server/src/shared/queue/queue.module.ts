import { Global, Module, Logger } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";

const logger = new Logger("QueueModule");

/**
 * BullMQ 全局连接模块（Redis 可选）
 *
 * Redis 不可达时 BullMQ 会启动但队列操作静默失败，不阻塞 server 启动。
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [SERVER_ENV],
      useFactory: (env: ServerEnv) => {
        if (env.NODE_ENV === "test") {
          logger.log("NODE_ENV=test，BullMQ 返回 loopback 配置");
        }
        return {
          connection: {
            url: env.REDIS_URL,
            maxRetriesPerRequest: null,
            // Redis 不可达时快速失败不阻塞
            connectTimeout: 3000,
            retryStrategy: (times: number): number | null => {
              if (times > 3) {
                logger.warn("Redis 连接失败，BullMQ 队列功能降级");
                return null;
              }
              return Math.min(times * 500, 2000);
            },
            enableOfflineQueue: false,
          },
          defaultJobOptions: {
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 },
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
