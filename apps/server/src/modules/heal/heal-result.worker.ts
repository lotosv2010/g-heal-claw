import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { QueueName, HealResultPayloadSchema } from "@g-heal-claw/shared";
import type { Job } from "bullmq";
import { HealService } from "./heal.service.js";

/**
 * HealResultWorker（ADR-0036 · T5.2.2.3）
 *
 * 消费 ai-heal-fix 队列，将 Agent 结果回写到 heal_jobs 表。
 */
@Processor(QueueName.AiHealFix)
export class HealResultWorker extends WorkerHost {
  private readonly logger = new Logger(HealResultWorker.name);

  public constructor(private readonly healService: HealService) {
    super();
  }

  public async process(job: Job<unknown>): Promise<void> {
    const parsed = HealResultPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      this.logger.error(`Invalid heal result payload job=${job.id}: ${parsed.error.message}`);
      return;
    }

    const { healJobId, status, prUrl, diagnosis, patch, errorMessage, trace } = parsed.data;
    this.logger.log(`Received heal result job=${healJobId} status=${status}`);

    await this.healService.updateJobStatus(healJobId, status, {
      diagnosis,
      patch,
      prUrl,
      errorMessage,
      trace,
    });
  }
}
