"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { FunnelStep } from "@/lib/api/funnel";

/**
 * 漏斗柱状图（ADR-0027）
 *
 * 使用 @ant-design/plots 的 Funnel 图形展示各步用户数 + 转化率；
 * 末步 0 保留柱子（不短路）；totalEntered=0 时渲染占位。
 */
const Funnel = dynamic(
  () => import("@ant-design/plots").then((m) => m.Funnel),
  {
    ssr: false,
    loading: () => <Skeleton className="h-80 w-full" />,
  },
);

interface FunnelDatum {
  readonly stage: string;
  readonly users: number;
}

export function FunnelChart({
  steps,
  totalEntered,
}: {
  readonly steps: readonly FunnelStep[];
  readonly totalEntered: number;
}) {
  const data = useMemo<FunnelDatum[]>(
    () =>
      steps.map((s) => ({
        stage: `${s.index}. ${s.eventName}`,
        users: s.users,
      })),
    [steps],
  );

  const config = useMemo(
    () => ({
      data,
      xField: "stage",
      yField: "users",
      shape: "funnel" as const,
      height: 320,
      label: {
        text: (d: FunnelDatum) => `${d.stage}\n${d.users.toLocaleString()} 人`,
        style: { fill: "#fff", fontSize: 12, fontWeight: 600 as const },
      },
      tooltip: {
        title: (d: FunnelDatum) => d.stage,
        items: [(d: FunnelDatum) => ({ name: "用户数", value: d.users })],
      },
      legend: false as const,
    }),
    [data],
  );

  if (totalEntered === 0) {
    return (
      <div className="text-muted-foreground py-16 text-center text-sm">
        当前窗口 / 首步事件无用户命中 · 确认 SDK 已上报 `{steps[0]?.eventName}`
      </div>
    );
  }

  return <Funnel {...config} />;
}
