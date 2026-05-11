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

/** 工具调用回调（实时通知外层写 trace） */
export type OnToolCallFn = (toolName: string, result: string) => Promise<void>;

/** createHealAgent 的参数 */
export interface CreateHealAgentParams {
  readonly model: BaseLanguageModel;
  readonly tools: StructuredToolInterface[];
  readonly payload: HealJobPayload;
  readonly maxIterations?: number;
  readonly onToolCall?: OnToolCallFn;
}

/** Agent 执行结果 */
export interface AgentResult {
  readonly output: string;
  readonly messages: BaseMessage[];
}

/**
 * 创建自愈诊断 Agent
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
  // 如果有回调，包装 tools 使每次调用后触发
  const wrappedParams = params.onToolCall
    ? { ...params, tools: wrapToolsWithCallback(params.tools, params.onToolCall) }
    : params;
  const agent = createHealAgent(wrappedParams);

  const input = [
    `请诊断并修复以下异常 Issue。`,
    ``,
    `Issue ID: ${params.payload.issueId}`,
    `仓库: ${params.payload.repoUrl}`,
    `分支: ${params.payload.branch}`,
    ``,
    `步骤：readIssue("${params.payload.issueId}") → 分析堆栈 → readFile → writePatch → createPr`,
    `如果任何步骤失败超过 3 次，停止并回复当前结论。`,
  ].join("\n");

  const result = await agent.invoke(
    { messages: [new HumanMessage(input)] },
    { recursionLimit: params.maxIterations ?? 50 },
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

/**
 * 包装 tools：每次调用后触发 onToolCall 回调
 */

function wrapToolsWithCallback(
  tools: readonly StructuredToolInterface[],
  onToolCall: OnToolCallFn,
): StructuredToolInterface[] {
  return tools.map((t) => {
    const originalInvoke = t.invoke.bind(t);
    const wrapped = Object.create(t);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrapped.invoke = async (input: any, config?: any) => {
      const result = await originalInvoke(input, config);
      const resultStr = typeof result === "string" ? result : String(result);
      await onToolCall(t.name, resultStr.slice(0, 2000)).catch(() => {});
      return result;
    };
    return wrapped as StructuredToolInterface;
  });
}
