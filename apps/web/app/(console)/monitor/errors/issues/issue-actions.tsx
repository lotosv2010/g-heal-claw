"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiDiagnoseTrigger } from "@/components/ai/ai-diagnose-trigger";
import type { IssueListItem } from "@/lib/api/issues";

export function IssueActions({ issue }: { issue: IssueListItem }) {
  const message = `请分析以下异常 Issue 并提供修复建议：\n\n标题：${issue.title}\n类型：${issue.subType}\n状态：${issue.status}\n事件数：${issue.eventCount}\n影响会话：${issue.impactedSessions}\n指纹：${issue.fingerprint}`;

  return (
    <div className="flex items-center gap-1">
      <AiDiagnoseTrigger
        message={message}
        title={`诊断: ${(issue.title || "异常").slice(0, 20)}`}
        size="sm"
      />
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/monitor/errors/issues/${issue.id}`}>
          <Eye className="mr-1 size-3.5" />
          详情
        </Link>
      </Button>
    </div>
  );
}
