"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TrackTrendBucket } from "@/lib/api/tracking";

/**
 * 埋点事件趋势图
 *
 * 两个视图：事件数 / 去重用户
 *  - 右上角 Segmented 切换
 *  - 标题副文随视图变化，明示当前 y 轴单位
 */
const Line = dynamic(
  () => import("@/components/charts/themed-charts").then((m) => ({ default: m.ThemedLine })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full" />,
  },
);

type MetricGroup = "count" | "users";

interface MetricTabDef {
  readonly key: MetricGroup;
  readonly label: string;
  readonly subtitle: string;
  readonly color: string;
  readonly seriesLabel: string;
  readonly yTitle: string;
}

const METRIC_TABS: readonly MetricTabDef[] = [
  {
    key: "count",
    label: "事件数",
    subtitle: "每小时 track_events_raw 入库条数 · 单位：次",
    color: "#3b82f6",
    seriesLabel: "事件数",
    yTitle: "次数",
  },
  {
    key: "users",
    label: "去重用户",
    subtitle: "COALESCE(user_id, session_id) 每小时去重 · 单位：人",
    color: "#8b5cf6",
    seriesLabel: "去重用户",
    yTitle: "人数",
  },
];

interface ChartDatum {
  readonly hour: string;
  readonly series: string;
  readonly value: number;
}

export function TrendChart({
  buckets,
}: {
  buckets: readonly TrackTrendBucket[];
}) {
  const [group, setGroup] = useState<MetricGroup>("count");

  const hourFormat = useMemo(() => {
    if (buckets.length < 2) return "HH:00";
    const first = dayjs(buckets[0]!.hour);
    const last = dayjs(buckets[buckets.length - 1]!.hour);
    return last.diff(first, "day") >= 1 ? "MM-DD HH:00" : "HH:00";
  }, [buckets]);

  const activeTab = METRIC_TABS.find((m) => m.key === group) ?? METRIC_TABS[0]!;

  if (buckets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>事件趋势</CardTitle>
          <div className="text-muted-foreground text-xs">
            按小时聚合事件数 / 去重用户
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground py-10 text-center text-sm">
            当前窗口无趋势数据
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>事件趋势</CardTitle>
          <div className="text-muted-foreground mt-1 text-xs">
            {activeTab.subtitle}
          </div>
        </div>
        <Segmented items={METRIC_TABS} active={group} onChange={setGroup} />
      </CardHeader>

      <CardContent>
        <SingleChart
          buckets={buckets}
          hourFormat={hourFormat}
          seriesLabel={activeTab.seriesLabel}
          color={activeTab.color}
          yTitle={activeTab.yTitle}
          selector={(b) => (group === "count" ? b.count : b.uniqueUsers)}
        />
      </CardContent>
    </Card>
  );
}

interface SingleChartProps {
  readonly buckets: readonly TrackTrendBucket[];
  readonly hourFormat: string;
  readonly seriesLabel: string;
  readonly color: string;
  readonly selector: (b: TrackTrendBucket) => number;
  readonly yTitle: string;
}

function SingleChart({
  buckets,
  hourFormat,
  seriesLabel,
  color,
  selector,
  yTitle,
}: SingleChartProps) {
  const data = useMemo(
    () =>
      buckets.map((b) => ({
        hour: dayjs(b.hour).format(hourFormat),
        series: seriesLabel,
        value: selector(b),
      })),
    [buckets, hourFormat, seriesLabel, selector],
  );

  const config = useMemo(
    () => ({
      data,
      xField: "hour",
      yField: "value",
      colorField: "series",
      height: 260,
      legend: false as const,
      scale: { color: { domain: [seriesLabel], range: [color] } },
      axis: {
        x: { title: "时间", titleFontSize: 10, labelFontSize: 10 },
        y: { title: yTitle, titleFontSize: 10, labelFontSize: 10 },
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
    [data, seriesLabel, color, yTitle],
  );

  return <Line {...config} />;
}

function Segmented({
  items,
  active,
  onChange,
}: {
  items: readonly MetricTabDef[];
  active: MetricGroup;
  onChange: (v: MetricGroup) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="趋势视图切换"
      className="bg-muted inline-flex shrink-0 rounded-md p-0.5 text-xs"
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(item.key)}
            className={cn(
              "rounded px-3 py-1 font-medium transition",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
