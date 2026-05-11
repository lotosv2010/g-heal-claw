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
export type OnToolCallFn = (toolName: string, phase: "call" | "result", content: string) => Promise<void>;

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

  const basePath = params.payload.basePath || "";
  const scopeHint = basePath
    ? `代码范围限定在 "${basePath}" 目录下，所有 readFile/grepRepo/writePatch 的路径都以此为前缀。`
    : "";

  const input = [
    `请诊断并修复以下异常 Issue，严格按以下步骤执行：`,
    ``,
    `Issue ID: ${params.payload.issueId}`,
    `仓库: ${params.payload.repoUrl}`,
    `分支: ${params.payload.branch}`,
    scopeHint ? `源码目录: ${basePath}` : "",
    ``,
    `第一步：调用 readIssue("${params.payload.issueId}") 获取上下文`,
    `第二步：根据堆栈中的错误消息，调用 grepRepo 搜索源码定位出错文件${basePath ? `（directory 参数使用 "${basePath}"）` : ""}`,
    `第三步：调用 readFile 阅读相关源码`,
    `第四步：调用 writePatch 生成修复补丁`,
    `第五步：调用 createPr 创建 Pull Request`,
    ``,
    scopeHint,
    `你必须完成所有 5 步。不要在第一步之后就停止。`,
    `如果堆栈是压缩后的文件名，用错误消息文本通过 grepRepo 搜索源文件。`,
    `如果任何步骤连续失败 3 次，才可以停止并回复当前结论。`,
  ].filter(Boolean).join("\n");

  // 使用 stream 模式逐步输出，每个节点完成后触发回调
  const messages: BaseMessage[] = [];
  let output = "";

  const stream = await agent.stream(
    { messages: [new HumanMessage(input)] },
    { recursionLimit: params.maxIterations ?? 50 },
  );

  for await (const chunk of stream) {
    // LangGraph stream 每次返回一个节点的输出
    const nodeMessages: BaseMessage[] = Object.values(chunk).flatMap(
      (v: unknown) => {
        const node = v as { messages?: BaseMessage[] };
        return node?.messages ?? [];
      },
    );

    for (const msg of nodeMessages) {
      messages.push(msg);
      // AI 思考文本实时回调
      if (AIMessage.isInstance(msg) && params.onToolCall) {
        const text = extractText(msg.content);
        if (text) {
          await params.onToolCall("__thinking__", "result", text.slice(0, 500)).catch(() => {});
        }
      }
    }
  }

  const lastAiMessage = [...messages].reverse().find(AIMessage.isInstance);
  output = lastAiMessage ? extractText(lastAiMessage.content) : "";

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
      // 记录调用参数
      const inputStr = typeof input === "string" ? input : JSON.stringify(input);
      await onToolCall(t.name, "call", inputStr.slice(0, 500)).catch(() => {});

      const result = await originalInvoke(input, config);

      // 记录调用结果
      let resultStr: string;
      if (typeof result === "string") {
        resultStr = result;
      } else if (result && typeof result === "object" && "content" in result) {
        resultStr = String((result as { content: unknown }).content);
      } else {
        resultStr = JSON.stringify(result) ?? "";
      }
      await onToolCall(t.name, "result", resultStr.slice(0, 2000)).catch(() => {});
      return result;
    };
    return wrapped as StructuredToolInterface;
  });
}
