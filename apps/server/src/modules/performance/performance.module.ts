import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueName } from "@g-heal-claw/shared";
import { DlqModule } from "../../dlq/dlq.module.js";
import { ApdexService } from "./apdex.service.js";
import { MetricMinuteService } from "./metric-minute.service.js";
import { PerfProcessor } from "./perf.processor.js";
import { PerformanceService } from "./performance.service.js";

/**
 * 性能数据持久化 + 异步聚合 + Apdex 模块（ADR-0013 + ADR-0037）
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.EventsPerformance }),
    DlqModule,
  ],
  providers: [PerformanceService, MetricMinuteService, PerfProcessor, ApdexService],
  exports: [PerformanceService, MetricMinuteService],
})
export class PerformanceModule {}
