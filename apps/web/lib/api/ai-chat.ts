/**
 * AI 对话 API 客户端
 *
 * 提供会话 CRUD、消息列表、SSE 流式发送消息和一键诊断功能。
 * 流式接口使用 fetch POST + ReadableStream 解析 SSE 帧。
 */

import { getAccessToken } from "../auth";
import { getApiBaseUrl, httpGet, httpPost, httpDelete } from "./http";

// ── 类型定义 ──

export interface Conversation {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Message {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly createdAt: string;
}

export interface Pagination {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export interface DiagnoseContext {
  readonly type: "general" | "issue" | "performance" | "api";
  readonly issueId?: string;
  readonly data?: Record<string, unknown>;
}

export interface DiagnoseParams {
  readonly type: "issue" | "performance" | "api";
  readonly issueId?: string;
  readonly data?: Record<string, unknown>;
  readonly question?: string;
}

// ── 会话 CRUD ──

export async function createConversation(
  projectId: string,
  title?: string,
): Promise<Conversation> {
  const res = await httpPost<{ data: Conversation }>(
    `/api/v1/ai/conversations?projectId=${projectId}`,
    { title },
  );
  return res.data;
}

export async function listConversations(
  projectId: string,
  page = 1,
): Promise<{ data: Conversation[]; pagination: Pagination }> {
  return httpGet<{ data: Conversation[]; pagination: Pagination }>(
    `/api/v1/ai/conversations?projectId=${encodeURIComponent(projectId)}&page=${page}&limit=20`,
  );
}

export async function deleteConversation(
  conversationId: string,
): Promise<void> {
  await httpDelete(`/api/v1/ai/conversations/${conversationId}`);
}

export async function updateConversationTitle(
  conversationId: string,
  title: string,
): Promise<void> {
  try {
    await httpPost(`/api/v1/ai/conversations/${conversationId}/title`, { title });
  } catch {
    // 静默
  }
}

// ── 消息 ──

export async function listMessages(
  conversationId: string,
  page = 1,
): Promise<{ data: Message[]; pagination: Pagination }> {
  return httpGet<{ data: Message[]; pagination: Pagination }>(
    `/api/v1/ai/conversations/${conversationId}/messages?page=${page}&limit=50`,
  );
}

/** 保存消息到 server（对话结束后持久化） */
export async function saveMessages(
  conversationId: string,
  userContent: string,
  assistantContent: string,
): Promise<void> {
  try {
    await httpPost(`/api/v1/ai/conversations/${conversationId}/save`, {
      userContent,
      assistantContent,
    });
  } catch {
    // 保存失败不阻塞 UI
  }
}

// ── SSE 流式消息 ──

export interface StreamResult {
  readonly reader: ReadableStreamDefaultReader<string>;
  readonly abort: () => void;
  readonly conversationId?: string;
}

/**
 * 流式发送消息并获取 AI 回复
 *
 * 使用 fetch POST + ReadableStream 解析 SSE data: 帧；
 * 返回一个可逐块读取文本的 reader 和中止函数。
 */
export function streamMessage(
  conversationId: string,
  content: string,
  _projectId: string,
  context?: DiagnoseContext,
  history?: Message[],
): StreamResult {
  const controller = new AbortController();
  // 走同源 Next.js API Route，无跨域
  const url = "/api/ai/chat";

  const messages = [
    ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content },
  ];

  const reader = createSseReader(url, { messages, context }, controller);
  return { reader, abort: () => controller.abort(), conversationId };
}

/**
 * 一键诊断（流式）
 *
 * 创建一个临时会话并进行诊断分析，返回流式结果。
 */
export function streamDiagnose(
  _projectId: string,
  params: DiagnoseParams,
): StreamResult {
  const controller = new AbortController();
  // 走同源 Next.js API Route
  const url = "/api/ai/chat";

  const messages = [
    { role: "user" as const, content: params.question ?? `请分析以下${params.type}问题并提供解决方案` },
  ];
  const context: DiagnoseContext = { type: params.type, issueId: params.issueId, data: params.data };

  const reader = createSseReader(url, { messages, context }, controller);
  return { reader, abort: () => controller.abort() };
}

// ── 内部 SSE 流解析 ──

function createSseReader(
  url: string,
  body: unknown,
  controller: AbortController,
): ReadableStreamDefaultReader<string> {
  const token = getAccessToken();

  const stream = new ReadableStream<string>({
    async start(streamController) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "请求失败");
          streamController.enqueue(`[错误] ${res.status}: ${errBody}`);
          streamController.close();
          return;
        }

        const bodyStream = res.body;
        if (!bodyStream) {
          streamController.close();
          return;
        }

        const reader = bodyStream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // 按 SSE 帧分割：以双换行分隔
          const frames = buffer.split("\n\n");
          // 最后一个可能是不完整帧，保留在 buffer
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const lines = frame.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") {
                  streamController.close();
                  return;
                }
                try {
                  const parsed = JSON.parse(data) as { content?: string; thinking?: string; error?: string };
                  if (parsed.error) {
                    streamController.enqueue(`[错误] ${parsed.error}`);
                  } else {
                    if (parsed.thinking) {
                      streamController.enqueue(`\u200Bthink:${parsed.thinking}`);
                    }
                    if (parsed.content) {
                      streamController.enqueue(`\u200Bcontent:${parsed.content}`);
                    }
                  }
                } catch {
                  if (data.trim()) {
                    streamController.enqueue(data);
                  }
                }
              }
            }
          }
        }

        // 处理 buffer 中剩余内容
        if (buffer.trim()) {
          const lines = buffer.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data !== "[DONE]") {
                try {
                  const parsed = JSON.parse(data) as { content?: string; thinking?: string };
                  if (parsed.thinking) {
                    streamController.enqueue(`\u200Bthink:${parsed.thinking}`);
                  }
                  if (parsed.content) {
                    streamController.enqueue(`\u200Bcontent:${parsed.content}`);
                  }
                } catch {
                  if (data.trim()) streamController.enqueue(data);
                }
              }
            }
          }
        }

        streamController.close();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          try {
            streamController.enqueue(`[错误] ${(err as Error).message}`);
          } catch {
            // stream 已关闭时忽略
          }
        }
        streamController.close();
      }
    },
  });

  return stream.getReader();
}
