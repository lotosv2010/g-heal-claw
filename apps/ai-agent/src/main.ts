import dotenvFlow from "dotenv-flow";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { parseEnv, AiAgentEnvSchema, QueueName } from "@g-heal-claw/shared";
import { processHealJob } from "./worker.js";

dotenvFlow.config();

const env = parseEnv(AiAgentEnvSchema, process.env);

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker(
  QueueName.AiDiagnosis,
  async (job) => processHealJob(job, env),
  {
    connection,
    concurrency: 2,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
);

worker.on("ready", () => {
  console.log(`[ai-agent] listening queue=${QueueName.AiDiagnosis} port=${env.AI_AGENT_PORT}`);
});

worker.on("failed", (job, err) => {
  console.error(`[ai-agent] job=${job?.id} failed:`, err.message);
});

// 优雅关闭
async function shutdown(): Promise<void> {
  console.log("[ai-agent] shutting down...");
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
