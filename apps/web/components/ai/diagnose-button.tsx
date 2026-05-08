"use client";

import { Bot } from "lucide-react";
import { Button } from "../ui/button";
import { useAiDrawer } from "./ai-provider";
import { streamDiagnose, createConversation } from "@/lib/api/ai-chat";

export interface DiagnoseContext {
  readonly type: "issue" | "performance" | "api";
  readonly issueId?: string;
  readonly data?: Record<string, unknown>;
  readonly question?: string;
}

interface DiagnoseButtonProps {
  readonly projectId: string;
  readonly context: DiagnoseContext;
  readonly label?: string;
}

/**
 * 一键 AI 方案按钮
 *
 * 点击后打开 AI 抽屉，创建诊断会话并流式展示结果。
 */
export function DiagnoseButton({ projectId, context, label = "AI 方案" }: DiagnoseButtonProps) {
  const { setOpen } = useAiDrawer();

  const handleClick = async () => {
    // 打开抽屉
    setOpen(true);

    // 通过自定义事件通知 AiDrawer 发起诊断
    const event = new CustomEvent("ai-diagnose", {
      detail: { projectId, context },
    });
    window.dispatchEvent(event);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      <Bot className="mr-1 size-4" />
      {label}
    </Button>
  );
}
