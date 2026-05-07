import { ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { AiAgentEnv, HealJobPayload, HealResultPayload } from "@g-heal-claw/shared";
import { createModel } from "../model/provider.js";
import { createTools } from "../tools/index.js";
import { runHealAgent, type AgentResult } from "../agent/index.js";

interface TraceEntry {
  role: "thought" | "action" | "observation";
  content: string;
  timestamp: number;
}

/**
 * ReAct 循环执行器（ADR-0036 · DESIGN §8.2）
 *
 * 组装 Model + Tools → DeepAgent，执行诊断，收集 trace。
 */
export async function runReactLoop(
  payload: HealJobPayload,
  env: AiAgentEnv,
): Promise<HealResultPayload> {
  const model = createModel(env);
  const tools = createTools(payload, env);
  const trace: TraceEntry[] = [];

  try {
    const result: AgentResult = await runHealAgent({
      model,
      tools,
      payload,
      maxIterations: env.AI_MAX_STEPS,
    });

    // 从 messages 中提取 tool call trace
    for (const msg of result.messages) {
      if (ToolMessage.isInstance(msg)) {
        trace.push({
          role: "observation",
          content: String(msg.content).slice(0, 2000),
          timestamp: Date.now(),
        });
      }
    }

    // 检查是否成功创建了 PR
    const prUrl = extractPrUrl(result.output, result.messages);

    if (prUrl) {
      return {
        healJobId: payload.healJobId,
        status: "pr_created",
        prUrl,
        diagnosis: result.output,
        trace,
      };
    }

    return {
      healJobId: payload.healJobId,
      status: "failed",
      diagnosis: result.output,
      errorMessage: "Agent completed without creating a PR",
      trace,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    trace.push({ role: "observation", content: `ERROR: ${message}`, timestamp: Date.now() });
    return {
      healJobId: payload.healJobId,
      status: "failed",
      errorMessage: message,
      trace,
    };
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
