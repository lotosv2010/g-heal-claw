import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenvFlow from "dotenv-flow";
import { parseEnv, AiAgentEnvSchema, type AiAgentEnv } from "@g-heal-claw/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/config/ → ../../ = apps/ai-agent/
const PKG_ROOT = path.resolve(__dirname, "../..");
// src/config/ → ../../../.. = monorepo root
const MONOREPO_ROOT = path.resolve(__dirname, "../../../..");

/**
 * 加载并校验环境变量
 *
 * 查找顺序：子包根目录 → monorepo 根目录 → 依赖系统环境变量
 */
export function loadAgentEnv(): AiAgentEnv {
  const candidates = [PKG_ROOT, MONOREPO_ROOT];
  const envDir = candidates.find((dir) =>
    fs.existsSync(path.join(dir, ".env")) || fs.existsSync(path.join(dir, ".env.local")),
  );

  if (envDir) {
    dotenvFlow.config({ path: envDir, silent: true });
  } else {
    console.warn("[ai-agent] 未找到 .env 文件，将依赖系统环境变量");
  }

  return parseEnv(AiAgentEnvSchema, process.env);
}
