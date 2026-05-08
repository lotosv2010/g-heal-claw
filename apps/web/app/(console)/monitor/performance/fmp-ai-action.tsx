"use client";

import { AiDiagnoseTrigger } from "@/components/ai/ai-diagnose-trigger";
import type { FmpPage } from "@/lib/api/performance";

export function FmpAiAction({ row }: { row: FmpPage }) {
  const message = `请分析以下页面的首屏时间性能问题并给出优化建议：\n\n页面 URL：${row.url}\n首屏时间 FMP 均值：${row.fmpAvgMs}ms\n页面完全加载：${row.fullyLoadedAvgMs}ms\n3s 内打开率：${(row.within3sRatio * 100).toFixed(1)}%\n采样数量：${row.sampleCount}`;

  return (
    <AiDiagnoseTrigger
      message={message}
      title={`首屏优化: ${row.url.slice(0, 20)}`}
      size="sm"
    />
  );
}
