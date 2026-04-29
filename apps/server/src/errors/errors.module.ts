import { Module } from "@nestjs/common";
import { DlqModule } from "../dlq/dlq.module.js";
import { ErrorsService } from "./errors.service.js";
import { IssuesService } from "./issues.service.js";

/**
 * ErrorsModule（ADR-0016 §2 / §3 / §5；T1.4.1 / T1.4.4）
 *
 * 职责：error 事件落库 + 指纹聚合 UPSERT + Dashboard 聚合查询的 DB 层。
 * 不持有 HTTP Controller —— Dashboard 层通过注入 ErrorsService 消费。
 *
 * 导入 DlqModule：raw insert / issues upsert 失败路径兜底入 DLQ。
 */
@Module({
  imports: [DlqModule],
  providers: [ErrorsService, IssuesService],
  exports: [ErrorsService, IssuesService],
})
export class ErrorsModule {}
