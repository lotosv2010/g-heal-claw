import { Module } from "@nestjs/common";
import { LogsService } from "./logs.service.js";

/**
 * LogsModule（ADR-0023 §4）
 *
 * 承载自定义分级日志（type='custom_log'）的落库 + 聚合能力。
 * 与 ErrorsModule（type='error'）分工：log 是运维 / 排障主动上报，error 是异常被动捕获。
 * DatabaseService 通过 @Global SharedModule 注入。
 */
@Module({
  providers: [LogsService],
  exports: [LogsService],
})
export class LogsModule {}
