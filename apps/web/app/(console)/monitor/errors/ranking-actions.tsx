"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiDiagnoseTrigger } from "@/components/ai/ai-diagnose-trigger";
import type { ErrorRankingRow } from "@/lib/api/errors";
import { CATEGORY_LABEL } from "@/lib/api/errors";

export function RankingActions({ row }: { row: ErrorRankingRow }) {
  const message = `请分析以下前端错误并提供修复建议：\n\n错误类型：${CATEGORY_LABEL[row.category]}\n错误内容：${row.messageHead}\n发生次数：${row.count}\n影响用户数：${row.impactedUsers}\n复现率：${(row.reproRate * 100).toFixed(1)}%\n示例页面：${row.sampleUrl || "未知"}`;

  return (
    <div className="flex items-center gap-1">
      <AiDiagnoseTrigger
        message={message}
        title={`诊断: ${row.messageHead.slice(0, 20)}`}
        size="sm"
      />
      <Button variant="ghost" size="sm" asChild>
        <Link href="/monitor/errors/issues">
          <Eye className="mr-1 size-3.5" />
          详情
        </Link>
      </Button>
    </div>
  );
}
