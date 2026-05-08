import { Global, Module } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";

/**
 * 数据库全局模块
 *
 * 暴露 DatabaseService 供各业务模块注入；ORM = Drizzle，驱动 = postgres.js。
 */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
