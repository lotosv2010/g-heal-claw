import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueName } from "@g-heal-claw/shared";
import { DlqModule } from "../../dlq/dlq.module.js";
import { SourcemapModule } from "../sourcemap/sourcemap.module.js";
import { ErrorProcessor } from "./error.processor.js";
import { ErrorsService } from "./errors.service.js";
import { IssueHllBackfillService } from "./hll-backfill.service.js";
import { IssueUserHllService } from "./hll.service.js";
import { IssuesService } from "./issues.service.js";

/**
 * ErrorsModule（ADR-0016 §2 / §3 / §5；T1.4.1 / T1.4.3 / T1.4.4 / TM.E / ADR-0026）
 *
 * 职责：error 事件落库 + 指纹聚合 UPSERT + Dashboard 聚合查询的 DB 层。
 * 不持有 HTTP Controller —— Dashboard 层通过注入 ErrorsService 消费。
 *
 * - DlqModule：raw insert / issues upsert 失败路径兜底入 DLQ
 * - SourcemapModule：ErrorProcessor 消费前的堆栈还原（stub）
 * - IssueUserHllService：HLL pfadd 写入路径的精确会话估算
 * - IssueHllBackfillService：cron 回写 issues.impacted_sessions
 * - ErrorProcessor：events-error 队列消费者（TM.E.1 骨架 / TM.E.4 落地）
 */
@Module({
  imports: [
    DlqModule,
    SourcemapModule,
    BullModule.registerQueue({ name: QueueName.EventsError }),
  ],
  providers: [
    ErrorsService,
    IssuesService,
    IssueUserHllService,
    IssueHllBackfillService,
    ErrorProcessor,
  ],
  exports: [ErrorsService, IssuesService, IssueUserHllService],
})
export class ErrorsModule {}
