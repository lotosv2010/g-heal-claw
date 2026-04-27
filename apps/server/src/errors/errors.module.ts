import { Module } from "@nestjs/common";
import { ErrorsService } from "./errors.service.js";

/**
 * ErrorsModule（ADR-0016 §2）
 *
 * 职责：error 事件落库 + Dashboard 聚合查询的 DB 层。
 * 不持有 HTTP Controller —— Dashboard 层通过注入 ErrorsService 消费。
 */
@Module({
  providers: [ErrorsService],
  exports: [ErrorsService],
})
export class ErrorsModule {}
