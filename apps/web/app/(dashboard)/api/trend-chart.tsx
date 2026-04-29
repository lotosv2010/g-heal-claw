"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ApiTrendBucket } from "@/lib/api/api";

/**
 * API 性能趋势图
 *
 * 三大指标组（切换）：
 *  - 次数：请求数 / 慢请求 / 失败请求（多曲线，y 轴：次数）
 *  - 耗时：avgDuration（ms）单曲线
 *  - 成功率：successRatio（%）单曲线
 *
 * 同一时间窗口，避免堆叠到同轴造成数量级失真
 */
const Line = dynamic(
  () => import("@ant-design/plots").then((m) => m.Line),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full" />,
  },
);

type CountSeriesKey = "count" | "slowCount" | "failedCount";
type MetricGroup = "count" | "duration" | "success";

interface SeriesDef {
  readonly key: CountSeriesKey;
  readonly label: string;
  readonly color: string;
}

const COUNT_SERIES: readonly SeriesDef[] = [
  { key: "count", label: "请求数", color: "#3b82f6" },
  { key: "slowCount", label: "慢请求", color: "#f59e0b" },
  { key: "failedCount", label: "失败请求", color: "#ef4444" },
];

const METRIC_TABS: readonly { key: MetricGroup; label: string }[] = [
  { key: "count", label: "样本数" },
  { key: "duration", label: "均耗时 (ms)" },
  { key: "success", label: "成功率" },
];

interface ChartDatum {
  readonly hour: string;
  readonly series: string;
  readonly value: number;
}

export function TrendChart({
  buckets,
}: {
  buckets: readonly ApiTrendBucket[];
}) {
  const [group, setGroup] = useState<MetricGroup>("count");
  const [visible, setVisible] = useState<Record<CountSeriesKey, boolean>>({
    count: true,
    slowCount: true,
    failedCount: true,
  });

  const hourFormat = useMemo(() => {
    if (buckets.length < 2) return "HH:00";
    const first = dayjs(buckets[0]!.hour);
    const last = dayjs(buckets[buckets.length - 1]!.hour);
    return last.diff(first, "day") >= 1 ? "MM-DD HH:00" : "HH:00";
  }, [buckets]);

  if (buckets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API 性能趋势</CardTitle>
          <div className="text-muted-foreground text-xs">
            按小时聚合样本量 / 均耗时 / 成功率
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
      <CardHeader>
        <CardTitle>API 性能趋势</CardTitle>
        <div className="text-muted-foreground text-xs">
          切换指标组查看样本量、均耗时与成功率
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap justify-center gap-1.5">
          {METRIC_TABS.map((m) => (
            <MetricChip
              key={m.key}
              label={m.label}
              active={group === m.key}
              onClick={() => setGroup(m.key)}
            />
          ))}
        </div>

        {group === "count" ? (
          <CountChart
            buckets={buckets}
            hourFormat={hourFormat}
            visible={visible}
            onToggle={(k) =>
              setVisible((prev) => ({ ...prev, [k]: !prev[k] }))
            }
          />
        ) : null}
        {group === "duration" ? (
          <SingleChart
            buckets={buckets}
            hourFormat={hourFormat}
            seriesLabel="均耗时 (ms)"
            color="#6366f1"
            selector={(b) => b.avgDurationMs}
            valueFormatter={(v) => `${Math.round(v).toLocaleString()} ms`}
            yTitle="毫秒"
          />
        ) : null}
        {group === "success" ? (
          <SingleChart
            buckets={buckets}
            hourFormat={hourFormat}
            seriesLabel="成功率"
            color="#10b981"
            selector={(b) => b.successRatio * 100}
            valueFormatter={(v) => `${v.toFixed(2)}%`}
            yTitle="百分比"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function CountChart({
  buckets,
  hourFormat,
  visible,
  onToggle,
}: {
  buckets: readonly ApiTrendBucket[];
  hourFormat: string;
  visible: Record<CountSeriesKey, boolean>;
  onToggle: (key: CountSeriesKey) => void;
}) {
  const data = useMemo<ChartDatum[]>(() => {
    const rows: ChartDatum[] = [];
    for (const b of buckets) {
      const hh = dayjs(b.hour).format(hourFormat);
      for (const s of COUNT_SERIES) {
        if (!visible[s.key]) continue;
        rows.push({ hour: hh, series: s.label, value: b[s.key] });
      }
    }
    return rows;
  }, [buckets, visible, hourFormat]);

  const activeSeries = COUNT_SERIES.filter((s) => visible[s.key]);

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

  const nothingVisible = activeSeries.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-center gap-1.5">
        {COUNT_SERIES.map((s) => (
          <LegendChip
            key={s.key}
            label={s.label}
            color={s.color}
            active={visible[s.key]}
            onToggle={() => onToggle(s.key)}
          />
        ))}
      </div>

      {nothingVisible ? (
        <div className="text-muted-foreground flex h-[260px] items-center justify-center text-xs">
          请从上方图例启用至少一条曲线
        </div>
      ) : (
        <Line {...config} />
      )}
    </div>
  );
}

interface SingleChartProps {
  readonly buckets: readonly ApiTrendBucket[];
  readonly hourFormat: string;
  readonly seriesLabel: string;
  readonly color: string;
  readonly selector: (b: ApiTrendBucket) => number;
  readonly valueFormatter: (v: number) => string;
  readonly yTitle: string;
}

function SingleChart({
  buckets,
  hourFormat,
  seriesLabel,
  color,
  selector,
  valueFormatter,
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

function LegendChip({
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
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition",
        active
          ? "border-foreground/30 bg-foreground/5 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
      aria-pressed={active}
    >
      <span
        className="size-2 rounded-full"
        style={{
          backgroundColor: active ? color : "transparent",
          borderWidth: active ? 0 : 1,
          borderStyle: "solid",
          borderColor: color,
        }}
      />
      {label}
    </button>
  );
}

function MetricChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1 text-xs transition",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
