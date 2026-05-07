import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { QueueName, type SdkEvent } from "@g-heal-claw/shared";
import type { Job } from "bullmq";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";
import { DeadLetterService } from "../../dlq/dead-letter.service.js";
import { PerformanceService, type PerfOrLongTaskEvent } from "./performance.service.js";
import { MetricMinuteService } from "./metric-minute.service.js";

/**
 * events-performance 队列 Job 载荷（T2.1.4 / ADR-0037）
 */
export interface PerfJobPayload {
  readonly events: readonly PerfOrLongTaskEvent[];
  readonly enqueuedAt: number;
}

/**
 * PerformanceProcessor（T2.1.4.3 / ADR-0037）
 *
 * 链路：BullMQ job → saveBatch(raw) → 分钟聚合 → UPSERT metric_minute
 */
@Processor(QueueName.EventsPerformance, { concurrency: 4 })
export class PerfProcessor extends WorkerHost {
  private readonly logger = new Logger(PerfProcessor.name);

  public constructor(
    private readonly performance: PerformanceService,
    private readonly metricMinute: MetricMinuteService,
    private readonly dlq: DeadLetterService,
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
  ) {
    super();
  }

  public async process(job: Job<PerfJobPayload>): Promise<{ persisted: number }> {
    const { events, enqueuedAt } = job.data;
    const lag = Date.now() - enqueuedAt;
    this.logger.log(`processing batch=${events.length} lag=${lag}ms`);

    // 1. 原始数据落库
    const persisted = await this.performance.saveBatch(events);

    // 2. 按 (projectId, metric, minute) 聚合写入 metric_minute
    await this.metricMinute.aggregateAndUpsert(events);

    return { persisted };
  }

  @OnWorkerEvent("failed")
  public async onFailed(job: Job<PerfJobPayload>, err: Error): Promise<void> {
    this.logger.error(`job=${job.id} failed permanently: ${err.message}`);
    const events = job.data.events;
    if (events.length) {
      await this.dlq.enqueueEvents(
        events as unknown as readonly SdkEvent[],
        "perf-processor-fail",
        err.message,
      );
    }
  }
}
