import { Global, Logger, Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module.js";

/**
 * 全局基础设施模块
 *
 * 聚合 Logger + DatabaseModule（ADR-0013）；T1.3.2 会补充 `BullMQProvider`。
 */
@Global()
@Module({
  imports: [DatabaseModule],
  providers: [Logger],
  exports: [Logger, DatabaseModule],
})
export class SharedModule {}
