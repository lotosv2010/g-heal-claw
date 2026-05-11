import { ToolMessage, type BaseMessage } from "@langchain/core/messages";
import postgres from "postgres";
import type { AiAgentEnv, HealJobPayload, HealResultPayload } from "@g-heal-claw/shared";
import { HealJobStatus } from "@g-heal-claw/shared";
import { createModel } from "../model/provider.js";
import { createTools } from "../tools/index.js";
import { runHealAgent, type AgentResult } from "../agent/index.js";
import { cloneRepo, cleanupRepo } from "../git/clone.js";

interface TraceEntry {
  role: "thought" | "action" | "observation";
  content: string;
  timestamp: number;
}

/**
 * ReAct 循环执行器
 *
 * clone 仓库 → 组装 Model + Tools → DeepAgent 执行诊断 → 清理
 */
export async function runReactLoop(
  payload: HealJobPayload,
  env: AiAgentEnv,
): Promise<HealResultPayload> {
  const model = createModel(env);
  const tools = createTools(payload, env);
  const trace: TraceEntry[] = [];

  const log = (msg: string) => console.log(`[ai-agent][${payload.healJobId}] ${msg}`);

  // 实时更新数据库状态和 trace，前端轮询即可获取最新进度
  const syncDb = async (status?: string) => {
    const sql = postgres(env.DATABASE_URL, { max: 1 });
    try {
      if (status) {
        await sql`UPDATE heal_jobs SET status = ${status}, trace = ${JSON.stringify(trace)}::jsonb, updated_at = now() WHERE id = ${payload.healJobId}`;
      } else {
        await sql`UPDATE heal_jobs SET trace = ${JSON.stringify(trace)}::jsonb, updated_at = now() WHERE id = ${payload.healJobId}`;
      }
    } finally {
      await sql.end();
    }
  };

  const addTrace = async (role: TraceEntry["role"], content: string, status?: string) => {
    trace.push({ role, content, timestamp: Date.now() });
    log(content);
    await syncDb(status);
  };

  try {
    // 1. 克隆仓库
    await addTrace("action", `开始克隆仓库 ${payload.repoUrl}@${payload.branch}`, HealJobStatus.Cloning);
    await cloneRepo(payload, env.GITHUB_TOKEN);
    await addTrace("observation", "仓库克隆完成");

    // 2. 诊断阶段
    await addTrace("action", "启动 AI Agent 诊断分析", HealJobStatus.Diagnosing);

    // requireApproval 模式下移除 writePatch/createPr，Agent 只做诊断
    const agentTools = payload.requireApproval
      ? tools.filter((t) => t.name !== "writePatch" && t.name !== "createPr")
      : tools;

    const result: AgentResult = await runHealAgent({
      model,
      tools: agentTools,
      payload,
      maxIterations: env.AI_MAX_STEPS,
      onToolCall: async (toolName, phase, content) => {
        if (toolName === "__thinking__") {
          await addTrace("thought", content.slice(0, 500));
        } else if (phase === "call") {
          await addTrace("action", `调用 ${toolName}(${content.slice(0, 200)})`);
        } else {
          await addTrace("observation", `[${toolName}] ${content.slice(0, 500)}`);
        }
      },
    });

    await addTrace("observation", `Agent 执行完毕，共 ${result.messages.length} 步`);

    // 3. 需要人工确认时暂停
    if (payload.requireApproval) {
      await addTrace("action", "诊断完成，等待用户确认是否创建 PR", HealJobStatus.AwaitingApproval);
      return {
        healJobId: payload.healJobId,
        status: "awaiting_approval",
        diagnosis: result.output,
        trace,
      };
    }

    // 4. 自动模式：检查是否成功创建 PR
    const prUrl = extractPrUrl(result.output, result.messages);
    addTrace("observation", `提取到 PR URL: ${prUrl}`);

    if (prUrl) {
      await addTrace("action", `修复成功，PR 已创建: ${prUrl}`, HealJobStatus.PrCreated);
      return {
        healJobId: payload.healJobId,
        status: "pr_created",
        prUrl,
        diagnosis: result.output,
        trace,
      };
    }

    await addTrace("observation", "Agent 完成但未能创建 PR", HealJobStatus.Failed);
    return {
      healJobId: payload.healJobId,
      status: "failed",
      diagnosis: result.output,
      errorMessage: "Agent completed without creating a PR",
      trace,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await addTrace("observation", `执行失败: ${message}`, HealJobStatus.Failed).catch(() => {});
    return {
      healJobId: payload.healJobId,
      status: "failed",
      errorMessage: message,
      trace,
    };
  } finally {
    log("清理临时目录");
    await cleanupRepo(payload.healJobId).catch(() => {});
  }
}

function extractPrUrl(output: string, messages: BaseMessage[]): string | undefined {
  const urlPattern = /https:\/\/github\.com\/[^\s)]+\/pull\/\d+/;

  // 优先从最终输出中提取
  const match = output.match(urlPattern);
  if (match) return match[0];

  // 从 ToolMessage 中反向查找 createPr 的结果
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (ToolMessage.isInstance(msg) && msg.name === "createPr") {
      const obsMatch = String(msg.content).match(urlPattern);
      if (obsMatch) return obsMatch[0];
    }
  }
  return undefined;
}
