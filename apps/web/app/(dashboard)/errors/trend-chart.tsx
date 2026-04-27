"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import dayjs from "dayjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ErrorTrendBucket } from "@/lib/api/errors";

// 对齐 /performance 的 Line 动态加载（避免 SSR DOM 报错 + 按需分包）
const Line = dynamic(
  () => import("@ant-design/plots").then((m) => m.Line),
  {
    ssr: false,
    loading: () => <Skeleton className="h-60 w-full" />,
  },
);

type SeriesKey = "js" | "promise" | "resource";
interface TrendDatum {
  readonly hour: string;
  readonly metric: SeriesKey;
  readonly value: number;
}

const SERIES_LABEL: Record<SeriesKey, string> = {
  js: "JS",
  promise: "Promise",
  resource: "Resource",
};

const SERIES_COLORS: Record<SeriesKey, string> = {
  js: "#f5222d",
  promise: "#faad14",
  resource: "#1677ff",
};

/** 24 小时 × 三条主要子类型（js/promise/resource）事件数趋势 */
export function TrendChart({
  buckets,
}: {
  buckets: readonly ErrorTrendBucket[];
}) {
  const data = useMemo<TrendDatum[]>(() => {
    const rows: TrendDatum[] = [];
    for (const b of buckets) {
      const hh = dayjs(b.hour).format("HH:00");
      rows.push({ hour: hh, metric: "js", value: b.js });
      rows.push({ hour: hh, metric: "promise", value: b.promise });
      rows.push({ hour: hh, metric: "resource", value: b.resource });
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
          domain: ["js", "promise", "resource"] as SeriesKey[],
          range: [
            SERIES_COLORS.js,
            SERIES_COLORS.promise,
            SERIES_COLORS.resource,
          ],
        },
      },
      axis: {
        x: { title: null, labelFontSize: 10 },
        y: { title: "事件数", labelFontSize: 10 },
      },
      legend: {
        color: {
          position: "top" as const,
          itemLabelFormatter: (name: string) =>
            SERIES_LABEL[name as SeriesKey] ?? name,
        },
      },
      height: 240,
      tooltip: {
        items: [
          {
            field: "value",
            name: "事件数",
            valueFormatter: (v: number) => v.toLocaleString(),
          },
        ],
      },
      interaction: { tooltip: { shared: true } },
    }),
    [data],
  );

  if (buckets.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>异常趋势 · 过去 24 小时</CardTitle>
        <div className="text-muted-foreground text-xs">
          JS / Promise / Resource 小时粒度事件数
        </div>
      </CardHeader>
      <CardContent>
        <Line {...config} />
      </CardContent>
    </Card>
  );
}
