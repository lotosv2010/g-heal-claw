import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { QueueName, type ErrorEvent } from "@g-heal-claw/shared";
import type { Job } from "bullmq";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";
import { DeadLetterService } from "../../dlq/dead-letter.service.js";
import { SourcemapService } from "../sourcemap/sourcemap.service.js";
import { ErrorsService } from "./errors.service.js";

/**
 * events-error 队列 Job 载荷（TM.E / ADR-0026）
 *
 * Gateway 仅投递最小批次（一次 ingest 的同类型事件数组），Processor 内部再做
 * Sourcemap 还原 + 指纹计算 + Issue UPSERT 全链路。
 */
export interface ErrorJobPayload {
  readonly events: readonly ErrorEvent[];
  /** 入队时戳（ms），用于消费延迟指标 */
  readonly enqueuedAt: number;
  /** 追溯链：来自同一次 ingest 的 batchId（可选，方便排查） */
  readonly batchId?: string;
  /** GeoIP 解析结果（Gateway 入队时注入） */
  readonly geo?: { country: string | null; region: string | null; city: string | null };
}

/**
 * ErrorProcessor（TM.E.1 骨架 / TM.E.4 完整落地）
 *
 * 链路：BullMQ job → SourcemapService.resolveFrames(stub) → ErrorsService.saveBatch
 * 失败策略：attempts / backoff 由 Producer 在 add() 指定；耗尽后走 onFailed → DLQ
 */
@Processor(QueueName.EventsError, { concurrency: 4 })
export class ErrorProcessor extends WorkerHost {
  private readonly logger = new Logger(ErrorProcessor.name);

  public constructor(
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    private readonly errors: ErrorsService,
    private readonly sourcemap: SourcemapService,
    private readonly dlq: DeadLetterService,
  ) {
    super();
  }

  public async process(job: Job<ErrorJobPayload>): Promise<{ persisted: number }> {
    const { events, geo } = job.data;
    if (events.length === 0) return { persisted: 0 };

    // 1. Sourcemap 还原（TM.E.3 stub：原样返回；T1.5.3 实装后替换）
    const restored = await this.sourcemap.resolveFrames(events);

    // 2. 落库 + 指纹计算 + Issue UPSERT（ErrorsService.saveBatch 内部闭环）
    const persisted = await this.errors.saveBatch(restored, geo);

    this.logger.log(
      `events-error job=${job.id} batch=${events.length} persisted=${persisted} ` +
        `latencyMs=${Date.now() - job.data.enqueuedAt}`,
    );
    return { persisted };
  }

  /**
   * Worker 重试全部耗尽 → 转投 DLQ
   *
   * @OnWorkerEvent('failed') 只在最后一次 attempt 失败时触发（job.attemptsMade === attempts）
   */
  @OnWorkerEvent("failed")
  public async onFailed(job: Job<ErrorJobPayload>, err: Error): Promise<void> {
    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts?.attempts ?? this.env.ERROR_PROCESSOR_ATTEMPTS;
    if (attemptsMade < maxAttempts) {
      // 非终态失败，由 BullMQ 继续重试
      this.logger.warn(
        `events-error job=${job.id} attempt ${attemptsMade}/${maxAttempts} failed: ${err.message}`,
      );
      return;
    }
    // 终态：事件批次落 DLQ，stage=error-raw-insert（复用现有枚举）
    try {
      const count = await this.dlq.enqueueEvents(
        job.data.events,
        "error-raw-insert",
        `processor-exhausted: ${err.message}`.slice(0, 500),
      );
      this.logger.error(
        `events-error job=${job.id} 重试耗尽，已入 DLQ count=${count}: ${err.message}`,
      );
    } catch (dlqErr) {
      this.logger.error(
        `events-error job=${job.id} DLQ 兜底写入也失败: ${(dlqErr as Error).message}`,
      );
    }
  }
}
