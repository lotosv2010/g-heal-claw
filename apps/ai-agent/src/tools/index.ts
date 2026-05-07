import type { StructuredTool } from "@langchain/core/tools";
import type { AiAgentEnv, HealJobPayload } from "@g-heal-claw/shared";
import { createReadIssueTool } from "./read-issue.js";
import { createReadFileTool } from "./read-file.js";
import { createGrepRepoTool } from "./grep-repo.js";
import { createWritePatchTool } from "./write-patch.js";
import { createCreatePrTool } from "./create-pr.js";

/**
 * 为当前 heal job 创建工具集合（ADR-0036 · 5 核心 Tools）
 */
export function createTools(
  payload: HealJobPayload,
  env: AiAgentEnv,
): StructuredTool[] {
  return [
    createReadIssueTool(payload, env),
    createReadFileTool(payload, env),
    createGrepRepoTool(payload, env),
    createWritePatchTool(payload, env),
    createCreatePrTool(payload, env),
  ];
}
