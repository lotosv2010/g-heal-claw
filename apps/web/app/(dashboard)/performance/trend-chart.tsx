"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import dayjs from "dayjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrendBucket } from "@/lib/api/performance";
import { Skeleton } from "@/components/ui/skeleton";

// AntV @ant-design/plots 依赖浏览器 DOM，使用 next/dynamic + ssr:false 规避 SSR 报错
// 同时也让图表库按需分包，不进入初次 HTML 负载
const Line = dynamic(
  () => import("@ant-design/plots").then((m) => m.Line),
  {
    ssr: false,
    loading: () => <Skeleton className="h-60 w-full" />,
  },
);

type SeriesKey = "LCP" | "FCP" | "INP" | "TTFB";
interface TrendDatum {
  readonly hour: string;
  readonly metric: SeriesKey;
  readonly value: number;
}

// AntV G2 官方 Category-10 色板（与 Ant Design Charts 默认一致）
const SERIES_COLORS: Record<SeriesKey, string> = {
  LCP: "#1677ff", // AntD Blue-6
  FCP: "#52c41a", // AntD Green-6
  INP: "#faad14", // AntD Gold-6
  TTFB: "#722ed1", // AntD Purple-6
};

// 24 小时多系列 Web Vitals p75 趋势图
export function TrendChart({ buckets }: { buckets: readonly TrendBucket[] }) {
  const data = useMemo<TrendDatum[]>(() => {
    const rows: TrendDatum[] = [];
    for (const b of buckets) {
      // 后端返回 UTC ISO；dayjs 默认使用浏览器本地时区格式化
      const hh = dayjs(b.hour).format("HH:00");
      rows.push({ hour: hh, metric: "LCP", value: b.lcpP75 });
      rows.push({ hour: hh, metric: "FCP", value: b.fcpP75 });
      rows.push({ hour: hh, metric: "INP", value: b.inpP75 });
      rows.push({ hour: hh, metric: "TTFB", value: b.ttfbP75 });
    }
    return rows;
  }, [buckets]);

  const config = useMemo(
    () => ({
      data,
      xField: "hour",
      yField: "value",
      colorField: "metric",
      shapeField: "smooth",
      scale: {
        color: {
          domain: ["LCP", "FCP", "INP", "TTFB"] as SeriesKey[],
          range: [
            SERIES_COLORS.LCP,
            SERIES_COLORS.FCP,
            SERIES_COLORS.INP,
            SERIES_COLORS.TTFB,
          ],
        },
      },
      axis: {
        x: { title: null, labelFontSize: 10 },
        y: { title: "ms", labelFontSize: 10 },
      },
      legend: { color: { position: "top" as const } },
      height: 240,
      tooltip: {
        items: [{ field: "value", name: "p75", valueFormatter: (v: number) => `${v} ms` }],
      },
      interaction: { tooltip: { shared: true } },
    }),
    [data],
  );

  if (buckets.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Web Vitals p75 · 过去 24 小时</CardTitle>
        <div className="text-muted-foreground text-xs">LCP / FCP / INP / TTFB 分钟粒度聚合</div>
      </CardHeader>
      <CardContent>
        <Line {...config} />
      </CardContent>
    </Card>
  );
}
