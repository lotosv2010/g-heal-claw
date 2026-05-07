import type { Job } from "bullmq";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import {
  QueueName,
  HealJobPayloadSchema,
  type HealJobPayload,
  type HealResultPayload,
  type AiAgentEnv,
} from "@g-heal-claw/shared";
import { runReactLoop } from "./react/loop.js";

/**
 * AI 诊断任务处理器
 *
 * 消费 ai-diagnosis 队列，执行 ReAct 循环，
 * 完成后将结果投递到 ai-heal-fix 队列由 server 侧回写。
 */
export async function processHealJob(
  job: Job<unknown>,
  env: AiAgentEnv,
): Promise<void> {
  const parsed = HealJobPayloadSchema.safeParse(job.data);
  if (!parsed.success) {
    console.error(`[ai-agent] invalid payload job=${job.id}:`, parsed.error.message);
    await publishResult(env, {
      healJobId: (job.data as Record<string, unknown>)?.healJobId as string ?? "unknown",
      status: "failed",
      errorMessage: `Invalid job payload: ${parsed.error.message}`,
    });
    return;
  }

  const payload: HealJobPayload = parsed.data;
  console.log(`[ai-agent] processing healJob=${payload.healJobId} issue=${payload.issueId}`);

  try {
    const result = await runReactLoop(payload, env);
    await publishResult(env, result);
    console.log(`[ai-agent] completed healJob=${payload.healJobId} status=${result.status}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ai-agent] error healJob=${payload.healJobId}:`, message);
    await publishResult(env, {
      healJobId: payload.healJobId,
      status: "failed",
      errorMessage: message,
    });
  }
}

async function publishResult(
  env: AiAgentEnv,
  result: HealResultPayload,
): Promise<void> {
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(QueueName.AiHealFix, { connection });
  await queue.add("heal-result", result, { removeOnComplete: true });
  await queue.close();
  await connection.quit();
}
