"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  CustomEventTrendBucket,
  CustomMetricTrendBucket,
} from "@/lib/api/custom";

/**
 * 自定义上报双轨趋势图：
 *  - 事件趋势：按小时事件数 单折线
 *  - 指标趋势：样本数 单折线 / 平均耗时 单折线 切换
 */
const Line = dynamic(
  () => import("@ant-design/plots").then((m) => m.Line),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full" />,
  },
);

type TabKey = "events" | "metrics_count" | "metrics_duration";

interface TabDef {
  readonly key: TabKey;
  readonly label: string;
  readonly subtitle: string;
}

const TABS: readonly TabDef[] = [
  {
    key: "events",
    label: "事件数",
    subtitle: "按小时 custom_event 触发次数 · 单位：次",
  },
  {
    key: "metrics_count",
    label: "指标样本",
    subtitle: "按小时 custom_metric 样本数 · 单位：次",
  },
  {
    key: "metrics_duration",
    label: "指标均耗",
    subtitle: "按小时平均 durationMs · 单位：毫秒",
  },
];

interface ChartDatum {
  readonly hour: string;
  readonly series: string;
  readonly value: number;
}

export function TrendChart({
  events,
  metrics,
}: {
  events: readonly CustomEventTrendBucket[];
  metrics: readonly CustomMetricTrendBucket[];
}) {
  const [tab, setTab] = useState<TabKey>("events");

  const activeBuckets = tab === "events" ? events : metrics;

  const hourFormat = useMemo(() => {
    if (activeBuckets.length < 2) return "HH:00";
    const first = dayjs(activeBuckets[0]!.hour);
    const last = dayjs(activeBuckets[activeBuckets.length - 1]!.hour);
    return last.diff(first, "day") >= 1 ? "MM-DD HH:00" : "HH:00";
  }, [activeBuckets]);

  const active = TABS.find((t) => t.key === tab) ?? TABS[0]!;

  if (activeBuckets.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>趋势</CardTitle>
            <div className="text-muted-foreground mt-1 text-xs">
              {active.subtitle}
            </div>
          </div>
          <Segmented items={TABS} active={tab} onChange={setTab} />
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
          <CardTitle>趋势</CardTitle>
          <div className="text-muted-foreground mt-1 text-xs">
            {active.subtitle}
          </div>
        </div>
        <Segmented items={TABS} active={tab} onChange={setTab} />
      </CardHeader>
      <CardContent>
        {tab === "events" ? (
          <SingleChart
            buckets={events}
            hourFormat={hourFormat}
            seriesLabel="事件数"
            color="#6366f1"
            selector={(b) => b.count}
            valueFormatter={(v) => v.toLocaleString()}
            yTitle="次数"
          />
        ) : null}
        {tab === "metrics_count" ? (
          <SingleChart
            buckets={metrics}
            hourFormat={hourFormat}
            seriesLabel="指标样本"
            color="#10b981"
            selector={(b) => b.count}
            valueFormatter={(v) => v.toLocaleString()}
            yTitle="次数"
          />
        ) : null}
        {tab === "metrics_duration" ? (
          <SingleChart
            buckets={metrics}
            hourFormat={hourFormat}
            seriesLabel="平均耗时 (ms)"
            color="#f59e0b"
            selector={(b) => b.avgDurationMs}
            valueFormatter={(v) => `${Math.round(v).toLocaleString()} ms`}
            yTitle="毫秒"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

interface SingleChartProps<T> {
  readonly buckets: readonly T[];
  readonly hourFormat: string;
  readonly seriesLabel: string;
  readonly color: string;
  readonly selector: (b: T) => number;
  readonly valueFormatter: (v: number) => string;
  readonly yTitle: string;
}

function SingleChart<T extends { hour: string }>({
  buckets,
  hourFormat,
  seriesLabel,
  color,
  selector,
  valueFormatter,
  yTitle,
}: SingleChartProps<T>) {
  const data = useMemo<ChartDatum[]>(
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
            value: valueFormatter(d.value),
          }),
        ],
      },
      interaction: { tooltip: { shared: true } },
    }),
    [data, seriesLabel, color, yTitle, valueFormatter],
  );

  return <Line {...config} />;
}

function Segmented({
  items,
  active,
  onChange,
}: {
  items: readonly TabDef[];
  active: TabKey;
  onChange: (v: TabKey) => void;
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
