import { Global, Module, Logger } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";

/**
 * BullMQ 全局连接模块（TM.E.1 / ADR-0026）
 *
 * - 通过 BullModule.forRootAsync 注入 REDIS_URL，避免字符串硬编码
 * - NODE_ENV=test 下返回一个指向本地 loopback 的连接配置；测试用 mock Queue 覆盖真实消费
 * - 所有 Producer / Consumer 通过 BullModule.registerQueue({ name: QueueName.X }) 接入
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [SERVER_ENV],
      useFactory: (env: ServerEnv) => {
        const logger = new Logger("BullModule");
        if (env.NODE_ENV === "test") {
          logger.log("NODE_ENV=test，BullMQ 返回 loopback 配置（测试侧注入 mock Queue）");
        }
        return {
          connection: {
            // ioredis 直接识别 REDIS_URL；密码/database/ssl 交由 URL 解析
            // maxRetriesPerRequest 保持 null 以避免 bullmq worker 长阻塞时报错
            url: env.REDIS_URL,
            maxRetriesPerRequest: null,
          },
          // 队列默认项：失败重试由 Producer 在 add() 时覆盖
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
