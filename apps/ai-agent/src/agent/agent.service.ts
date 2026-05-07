import {
  createDeepAgent,
  type DeepAgent,
  type DeepAgentTypeConfig,
} from "deepagents";
import { HumanMessage, AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { buildSystemPrompt, buildIssueContext, buildRepoConfigContext } from "./prompt.js";
import type { HealJobPayload } from "@g-heal-claw/shared";

/** Agent 名称常量 */
const AGENT_NAME = "g-heal-agent";

/** createHealAgent 的参数 */
export interface CreateHealAgentParams {
  readonly model: BaseLanguageModel;
  readonly tools: StructuredToolInterface[];
  readonly payload: HealJobPayload;
  readonly maxIterations?: number;
}

/** Agent 执行结果 */
export interface AgentResult {
  readonly output: string;
  readonly messages: BaseMessage[];
}

/**
 * 创建自愈诊断 Agent（ADR-0036）
 *
 * 组装 LLM + Tools + Prompt → DeepAgent。
 * System Prompt 包含角色定义 + Issue 上下文 + 仓库约束。
 */
export function createHealAgent(
  params: CreateHealAgentParams,
): DeepAgent<DeepAgentTypeConfig> {
  const { model, tools, payload } = params;

  const systemPrompt = buildSystemPrompt({
    issueContext: buildIssueContext(payload),
    repoConfigContext: buildRepoConfigContext(payload.repoConfig),
  });

  return createDeepAgent({
    model,
    name: AGENT_NAME,
    tools,
    systemPrompt,
  });
}

/**
 * 执行 Agent 诊断（入口函数）
 */
export async function runHealAgent(params: CreateHealAgentParams): Promise<AgentResult> {
  const agent = createHealAgent(params);

  const input = [
    `请诊断并修复以下异常 Issue。`,
    ``,
    `仓库: ${params.payload.repoUrl}`,
    `分支: ${params.payload.branch}`,
    ``,
    `首先使用 readIssue 获取完整上下文，然后逐步定位根因并生成修复 PR。`,
  ].join("\n");

  const result = await agent.invoke(
    { messages: [new HumanMessage(input)] },
    { recursionLimit: params.maxIterations ?? 20 },
  );

  const messages: BaseMessage[] = result.messages ?? [];
  const lastAiMessage = [...messages].reverse().find(AIMessage.isInstance);
  const output = lastAiMessage ? extractText(lastAiMessage.content) : "";

  return { output, messages };
}

function extractText(content: BaseMessage["content"]): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .filter((block): block is { type: "text"; text: string } =>
        typeof block === "object" && block !== null && block.type === "text",
      )
      .map((block) => block.text)
      .join("\n");
  }

  return String(content);
}
