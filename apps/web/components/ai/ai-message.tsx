"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { marked } from "marked";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import "highlight.js/styles/github-dark.css";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Brain, Copy, Check } from "lucide-react";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("sql", sql);

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
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    if (!content) return "";
    marked.setOptions({ breaks: true, gfm: true });

    const renderer = new marked.Renderer();
    renderer.code = ({ text, lang }) => {
      let language = lang && hljs.getLanguage(lang) ? lang : "";
      let highlighted: string;
      if (language) {
        highlighted = hljs.highlight(text, { language }).value;
      } else {
        // 无语言标记时自动检测
        const result = hljs.highlightAuto(text);
        highlighted = result.value;
        language = result.language ?? "";
      }
      return `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang">${lang || ""}</span><button class="copy-btn" data-code="${escapeAttr(text)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button></div><pre><code class="hljs">${highlighted}</code></pre></div>`;
    };

    return marked.parse(content, { renderer }) as string;
  }, [content]);

  // 挂载后绑定复制按钮事件
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest(".copy-btn") as HTMLElement | null;
      if (!btn) return;
      const code = btn.getAttribute("data-code") ?? "";
      navigator.clipboard.writeText(code).then(() => {
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => {
          btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
        }, 2000);
      });
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="ai-markdown prose prose-sm dark:prose-invert max-w-none prose-headings:text-[15px] prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-code:text-xs prose-code:text-sky-500 dark:prose-code:text-sky-400 prose-code:font-medium prose-code:before:content-none prose-code:after:content-none prose-table:my-3 prose-table:w-full prose-table:border-collapse prose-table:text-xs prose-table:border prose-table:border-border prose-table:rounded-lg prose-table:overflow-hidden prose-th:border prose-th:border-border/60 dark:prose-th:border-zinc-600 prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-medium prose-td:border prose-td:border-border/60 dark:prose-td:border-zinc-600 prose-td:px-3 prose-td:py-2 prose-hr:my-4 prose-blockquote:my-3 prose-blockquote:border-l-primary/40"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 使用 Zero-Width Space 作为标记前缀，对 PostgreSQL 安全
const THINK_MARKER = "\u200Bthink:";
const CONTENT_MARKER = "\u200Bcontent:";
const MARKER_REGEX = /\u200B(think|content):/g;

/** 从内容中分离 thinking 和 content 标记 */
function parseThinking(content: string): { thinking: string; answer: string } {
  // Step 1: 按标记拆分为 thinking 和 content 段
  let thinkRaw = "";
  let contentRaw = "";

  if (content.search(/\u200B(think|content):/) !== -1) {
    // 有标记时按标记分类
    const parts = content.split(MARKER_REGEX);
    // split 结果: [前缀文本, 匹配组1, 后续文本, 匹配组2, ...]
    // 由于用了 capturing group，结果交替为 [text, type, text, type, ...]
    let currentType: "content" | "think" | null = null;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (part === "think" || part === "content") {
        currentType = part;
      } else if (currentType === "think") {
        thinkRaw += part;
        currentType = null;
      } else if (currentType === "content") {
        contentRaw += part;
        currentType = null;
      } else {
        // 无标记的开头文本
        contentRaw += part;
      }
    }
  } else {
    contentRaw = content;
  }

  // Step 2: 处理 <think>...</think> 标签（Minimax 格式或旧数据）
  if (contentRaw.includes("<think>")) {
    const { thinking, answer } = extractThinkTags(contentRaw);
    return { thinking: (thinkRaw + thinking).trim(), answer: answer.trim() };
  }

  return { thinking: thinkRaw, answer: contentRaw };
}

/** 提取 <think>...</think> 标签中的内容 */
function extractThinkTags(text: string): { thinking: string; answer: string } {
  const openIdx = text.indexOf("<think>");
  if (openIdx === -1) return { thinking: "", answer: text };

  const closeIdx = text.indexOf("</think>");
  if (closeIdx === -1) {
    // 未闭合（流式中途）：<think> 后的内容都是 thinking
    const before = text.slice(0, openIdx);
    const after = text.slice(openIdx + 7);
    return { thinking: after, answer: before };
  }

  const before = text.slice(0, openIdx);
  const thinking = text.slice(openIdx + 7, closeIdx);
  const after = text.slice(closeIdx + 8);
  return { thinking, answer: before + after };
}
