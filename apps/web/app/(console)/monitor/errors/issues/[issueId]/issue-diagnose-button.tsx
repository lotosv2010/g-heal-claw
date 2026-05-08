"use client";

import { AiDiagnoseTrigger } from "@/components/ai/ai-diagnose-trigger";

interface Props {
  readonly issueId: string;
  readonly title: string;
  readonly stack?: string;
}

export function IssueDiagnoseButton({ issueId, title, stack }: Props) {
  const message = `请分析以下异常的根因并提供修复方案：\n\n标题：${title}\nIssue ID：${issueId}${stack ? `\n\n堆栈信息：\n${stack.slice(0, 2000)}` : ""}`;

  return (
    <AiDiagnoseTrigger
      message={message}
      title={`诊断: ${title.slice(0, 20)}`}
      label="AI 诊断"
    />
  );
}
