"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { VisitsTrendBucket } from "@/lib/api/visits";

/**
 * Visits 访问趋势图
 *
 * 布局与交互：
 *  - 右上角 Segmented 视图切换（PV / UV）
 *  - 图例位于图表下方，方块色标 + "图例：" 前缀
 *  - 与 API 趋势图对齐视觉语义
 */
const Line = dynamic(
  () => import("@ant-design/plots").then((m) => m.Line),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full" />,
  },
);

type SeriesKey = "pv" | "uv";

interface SeriesDef {
  readonly key: SeriesKey;
  readonly label: string;
  readonly color: string;
}

const SERIES: readonly SeriesDef[] = [
  { key: "pv", label: "PV", color: "#3b82f6" },
  { key: "uv", label: "UV", color: "#10b981" },
];

interface ChartDatum {
  readonly hour: string;
  readonly series: string;
  readonly value: number;
}

export function TrendChart({
  buckets,
}: {
  buckets: readonly VisitsTrendBucket[];
}) {
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    pv: true,
    uv: true,
  });

  const hourFormat = useMemo(() => {
    if (buckets.length < 2) return "HH:00";
    const first = dayjs(buckets[0]!.hour);
    const last = dayjs(buckets[buckets.length - 1]!.hour);
    return last.diff(first, "day") >= 1 ? "MM-DD HH:00" : "HH:00";
  }, [buckets]);

  const activeSeries = SERIES.filter((s) => visible[s.key]);

  const data = useMemo<ChartDatum[]>(() => {
    const rows: ChartDatum[] = [];
    for (const b of buckets) {
      const hh = dayjs(b.hour).format(hourFormat);
      for (const s of SERIES) {
        if (!visible[s.key]) continue;
        rows.push({ hour: hh, series: s.label, value: b[s.key] });
      }
    }
    return rows;
  }, [buckets, visible, hourFormat]);

  const config = useMemo(
    () => ({
      data,
      xField: "hour",
      yField: "value",
      colorField: "series",
      height: 260,
      legend: false as const,
      scale: {
        color: {
          domain: activeSeries.map((s) => s.label),
          range: activeSeries.map((s) => s.color),
        },
      },
      axis: {
        x: { title: "时间", titleFontSize: 10, labelFontSize: 10 },
        y: { title: "次数", titleFontSize: 10, labelFontSize: 10 },
      },
      tooltip: {
        title: (d: ChartDatum) => d.hour,
        items: [
          (d: ChartDatum) => ({
            name: d.series,
            value: d.value.toLocaleString(),
          }),
        ],
      },
      interaction: { tooltip: { shared: true } },
    }),
    [data, activeSeries],
  );

  if (buckets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>访问趋势</CardTitle>
          <div className="text-muted-foreground text-xs">
            按小时聚合 PV / UV
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground py-10 text-center text-sm">
            当前窗口无访问数据
          </p>
        </CardContent>
      </Card>
    );
  }

  const nothingVisible = activeSeries.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>访问趋势</CardTitle>
        <div className="text-muted-foreground mt-1 text-xs">
          按小时聚合 PV / UV · 单位：次
        </div>
      </CardHeader>
      <CardContent>
        {nothingVisible ? (
          <div className="text-muted-foreground flex h-[260px] items-center justify-center text-xs">
            请从下方图例启用至少一条曲线
          </div>
        ) : (
          <Line {...config} />
        )}

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 border-t pt-3">
          <span className="text-muted-foreground text-[11px]">图例：</span>
          {SERIES.map((s) => (
            <LegendSwitch
              key={s.key}
              label={s.label}
              color={s.color}
              active={visible[s.key]}
              onToggle={() =>
                setVisible((prev) => ({ ...prev, [s.key]: !prev[s.key] }))
              }
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LegendSwitch({
  label,
  color,
  active,
  onToggle,
}: {
  label: string;
  color: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs transition",
        active ? "text-foreground" : "text-muted-foreground/60",
      )}
      aria-pressed={active}
    >
      <span
        className="size-2.5 rounded-[2px] transition-opacity"
        style={{
          backgroundColor: color,
          opacity: active ? 1 : 0.25,
        }}
      />
      <span className={cn(!active && "line-through decoration-dotted")}>
        {label}
      </span>
    </button>
  );
}
