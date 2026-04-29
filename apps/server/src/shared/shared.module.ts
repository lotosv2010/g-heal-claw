import { Global, Logger, Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module.js";
import { RedisModule } from "./redis/redis.module.js";

/**
 * 全局基础设施模块
 *
 * 聚合 Logger + DatabaseModule（ADR-0013）+ RedisModule（T1.3.5 / T1.3.3）
 */
@Global()
@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [Logger],
  exports: [Logger, DatabaseModule, RedisModule],
})
export class SharedModule {}
