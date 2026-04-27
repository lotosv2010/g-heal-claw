import { Global, Module } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";

/**
 * 数据库全局模块（ADR-0013）
 *
 * 暴露 DatabaseService 供各业务模块注入；ORM = Drizzle，驱动 = postgres.js。
 * 后续 T1.1.5 会扩展完整 Schema + 迁移体系。
 */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
