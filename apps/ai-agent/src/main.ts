import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenvFlow from "dotenv-flow";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { parseEnv, AiAgentEnvSchema, QueueName } from "@g-heal-claw/shared";
import { processHealJob } from "./worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const MONOREPO_ROOT = path.resolve(__dirname, "../../..");

// 优先子包根目录 → monorepo 根目录 → 都找不到则警告继续（依赖系统环境变量）
const envPaths = [PKG_ROOT, MONOREPO_ROOT];
const envDir = envPaths.find((dir) =>
  fs.existsSync(path.join(dir, ".env")) || fs.existsSync(path.join(dir, ".env.local")),
);
if (envDir) {
  dotenvFlow.config({ path: envDir, silent: true });
} else {
  console.warn("[ai-agent] 未找到 .env 文件，将依赖系统环境变量");
}

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
