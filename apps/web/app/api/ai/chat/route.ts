import { NextRequest } from "next/server";
import OpenAI from "openai";

interface ChatRequestBody {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  context?: { type?: string; issueId?: string; data?: Record<string, unknown> };
}

const SYSTEM_PROMPT =
  "你是 G-Heal-Claw 的 AI 助手 🤖，专注于前端错误监控、性能优化和问题诊断。" +
  "请用中文简洁回复，适当使用 emoji 让回答更生动友好，提供有价值的技术建议。";

function buildContextPrompt(context?: ChatRequestBody["context"]): string {
  if (!context || !context.type || context.type === "general") return "";
  switch (context.type) {
    case "issue":
      return "\n\n当前上下文：用户正在查看一个错误 Issue。请重点分析错误原因、影响范围和修复建议。" +
        (context.data ? `\n相关数据：${JSON.stringify(context.data)}` : "");
    case "performance":
      return "\n\n当前上下文：用户正在分析性能瓶颈。请重点分析 Web Vitals 指标、加载瀑布和优化建议。" +
        (context.data ? `\n性能数据：${JSON.stringify(context.data)}` : "");
    case "api":
      return "\n\n当前上下文：用户正在排查 API 错误。请重点分析请求失败原因和解决方案。" +
        (context.data ? `\n接口数据：${JSON.stringify(context.data)}` : "");
    default:
      return "";
  }
}

function createClient(): OpenAI {
  const provider = (process.env.LLM_PROVIDER ?? "deepseek").trim();
  console.log(`💖💖💖💖💖💖💖💖Using LLM provider: ${provider}`);
  switch (provider) {
    case "deepseek":
    case "deepseek-reasoner":
      return new OpenAI({
        baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
        apiKey: process.env.DEEPSEEK_API_KEY,
      });
    case "moonshot":
      return new OpenAI({
        baseURL: process.env.MOONSHOT_BASE_URL ?? "https://api.moonshot.cn/v1",
        apiKey: process.env.MOONSHOT_API_KEY,
      });
    case "minimax":
      return new OpenAI({
        baseURL: (process.env.MINIMAX_BASE_URL ?? "https://api.minimaxi.com/v1").replace(/\/anthropic$/, "/v1"),
        apiKey: process.env.MINIMAX_API_KEY,
      });
    case "gemini":
      return new OpenAI({
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
        apiKey: process.env.GEMINI_API_KEY,
      });
    case "ollama":
      return new OpenAI({
        baseURL: (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434") + "/v1",
        apiKey: "ollama",
      });
    default:
      return new OpenAI({
        baseURL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
        apiKey: process.env.OPENAI_API_KEY,
      });
  }
}

function getModel(): string {
  const provider = (process.env.LLM_PROVIDER ?? "deepseek").trim();
  switch (provider) {
    case "deepseek": return process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
    case "deepseek-reasoner": return process.env.DEEPSEEK_REASONER_MODEL ?? "deepseek-reasoner";
    case "moonshot": return process.env.MOONSHOT_MODEL ?? "kimi-k2.5";
    case "minimax": return process.env.MINIMAX_MODEL ?? "MiniMax-M2.7";
    case "gemini": return process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
    case "ollama": return process.env.OLLAMA_MODEL ?? "qwen3.5:cloud";
    default: return process.env.OPENAI_MODEL ?? "gpt-4o";
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json()) as ChatRequestBody;
  const { messages, context } = body;

  if (!messages || messages.length === 0) {
    return Response.json({ error: "messages 不能为空" }, { status: 400 });
  }

  const client = createClient();
  console.log(`💖💖💖💖💖💖💖💖 client: ${client.baseURL}`);
  const model = getModel();
  const contextPrompt = buildContextPrompt(context);

  const fullMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT + contextPrompt },
    ...messages,
  ];

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: fullMessages,
      stream: true,
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            // 思考内容（DeepSeek reasoning_content 等）
            const reasoning = (delta as Record<string, unknown>)?.reasoning_content as string | undefined;
            if (reasoning) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ thinking: reasoning })}\n\n`),
              );
            }
            const content = delta?.content;
            if (content) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content })}\n\n`),
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    return Response.json(
      { error: `LLM 调用失败: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
