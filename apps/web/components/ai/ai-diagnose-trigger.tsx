"use client";

import { Bot } from "lucide-react";
import { Button } from "../ui/button";
import { useAiDiagnose } from "@/lib/hooks/use-ai-diagnose";

interface AiDiagnoseTriggerProps {
  readonly message: string;
  readonly title?: string;
  readonly issueId?: string;
  readonly label?: string;
  readonly size?: "sm" | "default" | "icon";
  readonly variant?: "outline" | "ghost" | "default";
}

/**
 * AI 诊断触发按钮（通用）
 *
 * 点击后创建新会话并发送诊断消息给 AI。
 */
export function AiDiagnoseTrigger({
  message,
  title,
  issueId,
  label = "AI 诊断",
  size = "sm",
  variant = "outline",
}: AiDiagnoseTriggerProps) {
  const { diagnose } = useAiDiagnose();

  return (
    <Button variant={variant} size={size} onClick={() => diagnose(message, title, issueId)}>
      <Bot className="mr-1 size-3.5" />
      {label}
    </Button>
  );
}
