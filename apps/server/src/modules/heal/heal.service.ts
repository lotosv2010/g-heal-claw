import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  QueueName,
  HealJobStatus,
  generateId,
  HEAL_JOB_ID_PREFIX,
  type HealJobPayload,
} from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import { healJobs } from "../../shared/database/schema/heal-jobs.js";
import type { TriggerHealDto, HealJobQueryDto } from "./dto/heal.dto.js";

@Injectable()
export class HealService {
  private readonly logger = new Logger(HealService.name);

  public constructor(
    private readonly database: DatabaseService,
    @InjectQueue(QueueName.AiDiagnosis) private readonly diagnosisQueue: Queue,
  ) {}

  async createJob(
    projectId: string,
    issueId: string,
    triggeredBy: string,
    dto: TriggerHealDto,
  ): Promise<typeof healJobs.$inferSelect> {
    const id = generateId(HEAL_JOB_ID_PREFIX);

    const [job] = await this.database.db!
      .insert(healJobs)
      .values({
        id,
        projectId,
        issueId,
        triggeredBy,
        status: HealJobStatus.Queued,
        repoUrl: dto.repoUrl,
        branch: dto.branch,
      })
      .returning();

    // 构建队列 payload
    const payload: HealJobPayload = {
      healJobId: id,
      issueId,
      projectId,
      repoUrl: dto.repoUrl,
      branch: dto.branch,
      issueTitle: "",  // HealController 在调用前填充
      issueMessage: "",
    };

    await this.diagnosisQueue.add("diagnose", payload, {
      jobId: id,
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    });

    this.logger.log(`Created heal job=${id} for issue=${issueId}`);
    return job;
  }

  async listJobs(projectId: string, query: HealJobQueryDto) {
    const { page, limit, status } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(healJobs.projectId, projectId)];
    if (status) conditions.push(eq(healJobs.status, status));

    const where = conditions.length === 1 ? conditions[0] : and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.database.db!
        .select()
        .from(healJobs)
        .where(where)
        .orderBy(desc(healJobs.createdAt))
        .limit(limit)
        .offset(offset),
      this.database.db!
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(healJobs)
        .where(where),
    ]);

    return {
      data: rows,
      pagination: { page, limit, total: countResult[0]?.count ?? 0 },
    };
  }

  async getJob(projectId: string, healJobId: string) {
    const [job] = await this.database.db!
      .select()
      .from(healJobs)
      .where(and(eq(healJobs.id, healJobId), eq(healJobs.projectId, projectId)));

    if (!job) throw new NotFoundException(`Heal job ${healJobId} not found`);
    return job;
  }

  async cancelJob(projectId: string, healJobId: string) {
    const job = await this.getJob(projectId, healJobId);

    if (job.status !== HealJobStatus.Queued) {
      throw new BadRequestException(`Cannot cancel job in status "${job.status}" — only "queued" jobs can be cancelled`);
    }

    const [updated] = await this.database.db!
      .update(healJobs)
      .set({ status: HealJobStatus.Failed, errorMessage: "Cancelled by user", updatedAt: new Date() })
      .where(eq(healJobs.id, healJobId))
      .returning();

    // 尝试移除队列中的 job
    try {
      const queueJob = await this.diagnosisQueue.getJob(healJobId);
      if (queueJob) await queueJob.remove();
    } catch {
      // 已被消费则忽略
    }

    return updated;
  }

  async updateJobStatus(
    healJobId: string,
    status: string,
    data?: {
      diagnosis?: string;
      patch?: string;
      prUrl?: string;
      errorMessage?: string;
      trace?: unknown;
    },
  ) {
    const now = new Date();
    const isTerminal = status === HealJobStatus.PrCreated || status === HealJobStatus.Failed;

    await this.database.db!
      .update(healJobs)
      .set({
        status,
        updatedAt: now,
        ...(isTerminal ? { completedAt: now } : {}),
        ...(data?.diagnosis ? { diagnosis: data.diagnosis } : {}),
        ...(data?.patch ? { patch: data.patch } : {}),
        ...(data?.prUrl ? { prUrl: data.prUrl } : {}),
        ...(data?.errorMessage ? { errorMessage: data.errorMessage } : {}),
        ...(data?.trace ? { trace: data.trace as Array<{ role: string; content: string; timestamp: number }> } : {}),
      })
      .where(eq(healJobs.id, healJobId));
  }
}
