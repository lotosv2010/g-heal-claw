"use client";

import { useMemo, useState } from "react";
import { marked } from "marked";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";

interface AiMessageProps {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly streaming?: boolean;
}

/**
 * AI 消息气泡
 *
 * - 用户消息：右对齐蓝色
 * - 助手消息：左对齐 + Markdown 渲染 + thinking 折叠
 * - 系统消息：居中弱色
 */
export function AiMessage({ role, content, streaming }: AiMessageProps) {
  if (role === "system") {
    return (
      <div className="flex justify-center py-2">
        <span className="text-muted-foreground text-xs">{content}</span>
      </div>
    );
  }

  const isUser = role === "user";

  return (
    <div className={cn("flex w-full gap-2 py-2", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted/80 text-foreground rounded-bl-md border",
        )}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap break-words">{content}</span>
        ) : (
          <AssistantContent content={content} streaming={streaming} />
        )}
      </div>
    </div>
  );
}

/** 助手消息内容：解析 thinking + markdown 渲染 */
function AssistantContent({ content, streaming }: { content: string; streaming?: boolean }) {
  const { thinking, answer } = useMemo(() => parseThinking(content), [content]);

  return (
    <div>
      {thinking && <ThinkingBlock content={thinking} />}
      <MarkdownContent content={answer} />
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-primary align-middle" />
      )}
    </div>
  );
}

/** 思考过程折叠块 */
function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-3 rounded-lg border border-dashed border-primary/20 bg-primary/5">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-primary/70 hover:text-primary transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Brain className="size-3.5" />
        <span className="font-medium">思考过程</span>
        {expanded
          ? <ChevronDown className="ml-auto size-3.5" />
          : <ChevronRight className="ml-auto size-3.5" />
        }
      </button>
      {expanded && (
        <div className="border-t border-dashed border-primary/10 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      )}
    </div>
  );
}

/** Markdown 渲染 */
function MarkdownContent({ content }: { content: string }) {
  const html = useMemo(() => {
    if (!content) return "";
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
    return marked.parse(content) as string;
  }, [content]);

  return (
    <div
      className="ai-markdown prose prose-sm dark:prose-invert max-w-none prose-headings:text-[15px] prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-pre:border-none prose-pre:rounded-lg prose-pre:text-xs prose-pre:my-3 prose-code:text-xs prose-code:text-sky-500 dark:prose-code:text-sky-400 prose-code:font-medium prose-code:before:content-none prose-code:after:content-none prose-table:my-3 prose-table:w-full prose-table:border-collapse prose-table:text-xs prose-th:border prose-th:border-border prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-medium prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-hr:my-4 prose-blockquote:my-3 prose-blockquote:border-l-primary/40"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** 从内容中分离 thinking 标记 */
function parseThinking(content: string): { thinking: string; answer: string } {
  // 格式：\x00think:xxx 混在正文中
  const thinkParts: string[] = [];
  const answerParts: string[] = [];

  const segments = content.split("\x00think:");
  // 第一段一定是正文（可能为空）
  if (segments[0]) answerParts.push(segments[0]);

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]!;
    // 每段开头到下一个非 think 内容之间都是 thinking
    // 由于 think 和 content 交替出现，整段都是 thinking
    thinkParts.push(seg);
  }

  // 如果只有 think 没有 answer，说明还在思考中
  return {
    thinking: thinkParts.join(""),
    answer: answerParts.join(""),
  };
}
