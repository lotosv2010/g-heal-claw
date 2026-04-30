"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 平均留存曲线（ADR-0028）
 *
 * 使用 @ant-design/plots 的 Line 展示 day 0 ~ day N 的加权平均留存率；
 * 空数据渲染占位，避免图形空白。
 */
const Line = dynamic(
  () => import("@ant-design/plots").then((m) => m.Line),
  {
    ssr: false,
    loading: () => <Skeleton className="h-72 w-full" />,
  },
);

interface LineDatum {
  readonly day: string;
  readonly retention: number;
}

export function RetentionChart({
  averageByDay,
}: {
  readonly averageByDay: readonly number[];
}) {
  const data = useMemo<LineDatum[]>(
    () =>
      averageByDay.map((v, i) => ({
        day: `day ${i}`,
        retention: Math.round(v * 10000) / 100, // 百分比 · 2 位小数
      })),
    [averageByDay],
  );

  const config = useMemo(
    () => ({
      data,
      xField: "day",
      yField: "retention",
      height: 288,
      point: { shapeField: "circle", sizeField: 3 },
      axis: {
        y: {
          labelFormatter: (v: number) => `${v}%`,
        },
      },
      tooltip: {
        items: [
          (d: LineDatum) => ({
            name: "留存率",
            value: `${d.retention.toFixed(2)}%`,
          }),
        ],
      },
      scale: { y: { domainMin: 0, domainMax: 100 } },
    }),
    [data],
  );

  const allZero = data.every((d) => d.retention === 0);
  if (allZero) {
    return (
      <div className="text-muted-foreground py-16 text-center text-sm">
        当前窗口各 day offset 留存率均为 0 · 可能样本量不足或未触达 return 窗口
      </div>
    );
  }

  return <Line {...config} />;
}
