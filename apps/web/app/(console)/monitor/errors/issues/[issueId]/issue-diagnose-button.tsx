"use client";

import { DiagnoseButton } from "@/components/ai/diagnose-button";
import { useActiveProject } from "@/lib/hooks/use-active-project";

interface Props {
  readonly issueId: string;
  readonly title: string;
  readonly stack?: string;
}

/** 异常详情页的 AI 方案按钮（客户端组件，读取当前项目 ID） */
export function IssueDiagnoseButton({ issueId, title, stack }: Props) {
  const projectId = useActiveProject();

  return (
    <DiagnoseButton
      projectId={projectId}
      context={{
        type: "issue",
        issueId,
        data: { title, stack: stack?.slice(0, 2000) },
        question: `请分析这个异常的根因并提供修复方案：${title}`,
      }}
    />
  );
}
