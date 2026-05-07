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
 * 布局与交互：
 *  - 右上角 Segmented 视图切换（样本数 / 均耗时 / 成功率）—— 视觉上靠近卡片标题，承担「切换视图」语义
 *  - 图表下方图例（仅样本数视图可见）—— 方块色标 + 前缀「图例：」，语义上承担「系列开关」
 *  - 标题副文随视图变化，明示当前 y 轴单位
 *
 * 这样避免"三个按钮和图例放在一起"造成的控件歧义
 */
const Line = dynamic(
  () => import("@/components/charts/themed-charts").then((m) => ({ default: m.ThemedLine })),
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

interface MetricTabDef {
  readonly key: MetricGroup;
  readonly label: string;
  /** 标题副文（解释当前视图） */
  readonly subtitle: string;
}

const METRIC_TABS: readonly MetricTabDef[] = [
  {
    key: "count",
    label: "样本数",
    subtitle: "请求数 / 慢请求 / 失败请求 · 单位：次",
  },
  {
    key: "duration",
    label: "均耗时",
    subtitle: "每小时平均请求耗时 · 单位：毫秒",
  },
  {
    key: "success",
    label: "成功率",
    subtitle: "2xx / 3xx 占比 · 单位：百分比",
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

  const activeTab = METRIC_TABS.find((m) => m.key === group) ?? METRIC_TABS[0]!;

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
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>API 性能趋势</CardTitle>
          <div className="text-muted-foreground mt-1 text-xs">
            {activeTab.subtitle}
          </div>
        </div>
        <Segmented
          items={METRIC_TABS}
          active={group}
          onChange={setGroup}
        />
      </CardHeader>

      <CardContent>
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
    <div>
      {nothingVisible ? (
        <div className="text-muted-foreground flex h-[260px] items-center justify-center text-xs">
          请从下方图例启用至少一条曲线
        </div>
      ) : (
        <Line {...config} />
      )}

      {/* 图例：置于图表下方，带"图例：" 语义前缀，方块色标区别于右上角的 Segmented 切换器 */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 border-t pt-3">
        <span className="text-muted-foreground text-[11px]">图例：</span>
        {COUNT_SERIES.map((s) => (
          <LegendSwitch
            key={s.key}
            label={s.label}
            color={s.color}
            active={visible[s.key]}
            onToggle={() => onToggle(s.key)}
          />
        ))}
      </div>
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

/**
 * 图例开关：方块色标 + 文本，灰态 = 当前隐藏。形态与右上角 Segmented 按钮明显不同
 */
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

/**
 * Segmented 视图切换器：同段连体按钮组，承担「切换当前视图」语义
 */
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
