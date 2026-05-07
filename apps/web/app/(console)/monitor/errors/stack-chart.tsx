"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type ErrorCategory,
  type ErrorStackBucket,
} from "@/lib/api/errors";

/**
 * 异常分析 · 堆叠柱状图（SPEC 第 3 区）
 *
 * 图例（固定顺序，共 10 条）：
 *   全部日志、JS 错误、Promise 错误、白屏、Ajax 异常、JS 加载异常、
 *   图片加载异常、CSS 加载异常、音视频资源异常、接口返回码异常
 *
 * "全部日志"点亮时 → 渲染折线（总和），与堆叠柱共轴；其余 9 条控制堆叠段显隐
 * 所有图例默认点亮；点击切换；SSR 关闭以避开 AntV DOM 依赖
 */

const DualAxes = dynamic(
  () => import("@/components/charts/themed-charts").then((m) => ({ default: m.ThemedDualAxes })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-72 w-full" />,
  },
);

/** 9 类目配色（与排行表 Badge 在语义上对齐，同色块便于 tooltip 联动识别） */
const CATEGORY_COLOR: Record<ErrorCategory, string> = {
  js: "#ef4444",          // red-500
  promise: "#f59e0b",     // amber-500
  white_screen: "#06b6d4", // cyan-500
  ajax: "#f97316",        // orange-500
  js_load: "#8b5cf6",     // violet-500
  image_load: "#10b981",  // emerald-500
  css_load: "#3b82f6",    // blue-500
  media: "#ec4899",       // pink-500
  api_code: "#64748b",    // slate-500
};

const TOTAL_COLOR = "#e11d48"; // rose-600，鲜艳高对比，凸显总量折线
const TOTAL_LABEL = "全部日志";

interface StackDatum {
  readonly hour: string;
  readonly category: string;
  readonly value: number;
}
interface TotalDatum {
  readonly hour: string;
  readonly total: number;
}

export function StackChart({
  buckets,
}: {
  buckets: readonly ErrorStackBucket[];
}) {
  const [visible, setVisible] = useState<Record<ErrorCategory | "total", boolean>>(
    () => {
      const init = { total: true } as Record<ErrorCategory | "total", boolean>;
      for (const cat of CATEGORY_ORDER) init[cat] = true;
      return init;
    },
  );

  // 跨度超过一天时带 MM-DD，否则仅 HH:00（与性能趋势一致）
  const hourFormat = useMemo<string>(() => {
    if (buckets.length < 2) return "HH:00";
    const first = dayjs(buckets[0]!.hour);
    const last = dayjs(buckets[buckets.length - 1]!.hour);
    return last.diff(first, "day") >= 1 ? "MM-DD HH:00" : "HH:00";
  }, [buckets]);

  const activeCategories = useMemo(
    () => CATEGORY_ORDER.filter((c) => visible[c]),
    [visible],
  );

  const stackData = useMemo<StackDatum[]>(() => {
    const rows: StackDatum[] = [];
    for (const b of buckets) {
      const hh = dayjs(b.hour).format(hourFormat);
      for (const cat of activeCategories) {
        rows.push({
          hour: hh,
          category: CATEGORY_LABEL[cat],
          value: b[cat] ?? 0,
        });
      }
    }
    return rows;
  }, [buckets, activeCategories, hourFormat]);

  const totalData = useMemo<TotalDatum[]>(() => {
    if (!visible.total) return [];
    return buckets.map((b) => {
      const total = CATEGORY_ORDER.reduce((sum, c) => sum + (b[c] ?? 0), 0);
      return { hour: dayjs(b.hour).format(hourFormat), total };
    });
  }, [buckets, visible.total, hourFormat]);

  const children = useMemo(() => {
    const views: unknown[] = [];
    let xRendered = false;
    const nextXAxis = (): unknown => {
      if (xRendered) return false as const;
      xRendered = true;
      return {
        title: "时间",
        titleFontSize: 10,
        labelFontSize: 10,
        labelAutoRotate: true,
      };
    };

    if (activeCategories.length > 0) {
      views.push({
        data: stackData,
        type: "interval",
        yField: "value",
        colorField: "category",
        stack: true,
        style: { maxWidth: 22, radiusTopLeft: 2, radiusTopRight: 2 },
        scale: {
          color: {
            domain: activeCategories.map((c) => CATEGORY_LABEL[c]),
            range: activeCategories.map((c) => CATEGORY_COLOR[c]),
          },
        },
        axis: {
          x: nextXAxis(),
          y: {
            position: "left" as const,
            title: "事件数",
            titleFontSize: 10,
            labelFontSize: 10,
          },
        },
        tooltip: {
          title: (d: { hour: string }) => d.hour,
          items: [
            (d: { category: string; value: number }) => ({
              name: d.category,
              value: d.value.toLocaleString(),
            }),
          ],
        },
      });
    }

    if (visible.total) {
      views.push({
        data: totalData,
        type: "line",
        yField: "total",
        shapeField: "smooth",
        style: { stroke: TOTAL_COLOR, lineWidth: 2 },
        axis: {
          x: nextXAxis(),
          y: {
            position: "right" as const,
            title: "全部日志",
            titleFontSize: 10,
            labelFontSize: 10,
          },
        },
        tooltip: {
          title: (d: { hour: string }) => d.hour,
          items: [
            (d: { total: number }) => ({
              name: TOTAL_LABEL,
              value: d.total.toLocaleString(),
            }),
          ],
        },
      });
    }

    return views;
  }, [activeCategories, stackData, visible.total, totalData]);

  const config = useMemo(
    () => ({
      xField: "hour",
      height: 320,
      legend: false as const,
      children,
      interaction: { tooltip: { shared: true } },
    }),
    [children],
  );

  if (buckets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>异常分析</CardTitle>
          <div className="text-muted-foreground text-xs">
            按小时粒度堆叠，点击图例切换类目
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground py-10 text-center text-sm">
            当前窗口无堆叠趋势数据
          </p>
        </CardContent>
      </Card>
    );
  }

  const nothingVisible = activeCategories.length === 0 && !visible.total;

  return (
    <Card>
      <CardHeader>
        <CardTitle>异常分析</CardTitle>
        <div className="text-muted-foreground text-xs">
          按小时粒度堆叠，点击图例切换类目；「全部日志」为折线（右轴）
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap justify-center gap-1.5">
          <LegendChip
            label={TOTAL_LABEL}
            color={TOTAL_COLOR}
            shape="dot"
            active={visible.total}
            onToggle={() =>
              setVisible((prev) => ({ ...prev, total: !prev.total }))
            }
          />
          {CATEGORY_ORDER.map((cat) => (
            <LegendChip
              key={cat}
              label={CATEGORY_LABEL[cat]}
              color={CATEGORY_COLOR[cat]}
              shape="square"
              active={visible[cat]}
              onToggle={() =>
                setVisible((prev) => ({ ...prev, [cat]: !prev[cat] }))
              }
            />
          ))}
        </div>

        {nothingVisible ? (
          <div className="text-muted-foreground flex h-[320px] items-center justify-center text-xs">
            请从上方图例启用至少一个类目
          </div>
        ) : (
          <DualAxes {...config} />
        )}
      </CardContent>
    </Card>
  );
}

interface LegendChipProps {
  readonly label: string;
  readonly color: string;
  readonly active: boolean;
  readonly shape: "dot" | "square";
  readonly onToggle: () => void;
}

function LegendChip({ label, color, active, shape, onToggle }: LegendChipProps) {
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
        className={cn(
          "size-2",
          shape === "square" ? "rounded-sm" : "rounded-full",
        )}
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
