import { Global, Logger, Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module.js";
import { GeoIpService } from "./geoip.service.js";
import { QueueModule } from "./queue/queue.module.js";
import { RedisModule } from "./redis/redis.module.js";

/**
 * 全局基础设施模块
 *
 * 聚合 Logger + DatabaseModule + RedisModule + QueueModule + GeoIpService
 * QueueModule 异步注册：Redis 不可达时退化为空模块
 */
@Global()
@Module({
  imports: [DatabaseModule, RedisModule, QueueModule.forRootAsync()],
  providers: [Logger, GeoIpService],
  exports: [Logger, DatabaseModule, RedisModule, QueueModule, GeoIpService],
})
export class SharedModule {}
