import { Module } from "@nestjs/common";
import { ErrorsService } from "./errors.service.js";
import { IssuesService } from "./issues.service.js";

/**
 * ErrorsModule（ADR-0016 §2 / §3；T1.4.1）
 *
 * 职责：error 事件落库 + 指纹聚合 UPSERT + Dashboard 聚合查询的 DB 层。
 * 不持有 HTTP Controller —— Dashboard 层通过注入 ErrorsService 消费。
 *
 * IssuesService 同时对外导出，留给 Dashboard T1.6.x 的 resolve/reopen 状态迁移路由。
 */
@Module({
  providers: [ErrorsService, IssuesService],
  exports: [ErrorsService, IssuesService],
})
export class ErrorsModule {}
