import { Global, Module } from "@nestjs/common";
import { RedisService } from "./redis.service.js";

/**
 * Redis 全局模块（T1.3.5 / T1.3.3）
 *
 * 暴露 RedisService 供 Gateway 幂等去重 / 限流 / DLQ 注入。
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
