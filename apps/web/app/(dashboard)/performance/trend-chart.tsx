"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrendBucket } from "@/lib/api/performance";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getSelectionPhrase, parseTimeSelection } from "@/lib/time-range";

// AntV @ant-design/plots 依赖浏览器 DOM，使用 next/dynamic + ssr:false 规避 SSR 报错
const DualAxes = dynamic(
  () => import("@ant-design/plots").then((m) => m.DualAxes),
  {
    ssr: false,
    loading: () => <Skeleton className="h-60 w-full" />,
  },
);

/**
 * 性能视图（过去 24 小时趋势）· 三轴组合图
 *
 * 轴划分：
 *  - 左轴「耗时（ms）」  折线：Navigation 6 段 + FCP/LCP/TTFB/FID/TTI/INP + FMP + TBT
 *  - 右轴「CLS 评分」    折线：CLS（无量纲 0~1，越小越好）· 与全局 CLS 口径统一
 *  - 右轴「样本数」      柱状：每桶样本数（近似 PV）
 *
 * 轴的显示/隐藏完全跟随图例选中：未选中对应系列时，轴不渲染，避免空轴导致 0 居中等歧义。
 *
 * 交互：
 *  - 默认展示「样本数」+「CLS」
 *  - 其余系列通过自定义图例一键开关（规避 @ant-design/plots 跨版本 legend filter API 差异）
 */

type MsSeriesKey =
  | "fmp"
  | "dns"
  | "tcp"
  | "ssl"
  | "contentDownload"
  | "ttfb"
  | "domParse"
  | "resourceLoad"
  | "lcp"
  | "fid"
  | "tti"
  | "tbt"
  | "inp"
  | "fcp";

type SeriesKey = "sampleCount" | "cls" | MsSeriesKey;

interface MsSeriesDef {
  readonly key: MsSeriesKey;
  readonly label: string;
  readonly color: string;
  readonly defaultVisible: boolean;
  readonly pick: (b: TrendBucket) => number;
}

/** 左轴耗时系列（毫秒，p75）—— 首屏时间默认展示，其余隐藏 */
const MS_SERIES: readonly MsSeriesDef[] = [
  { key: "fmp",            label: "首屏时间",   color: "#f97316", defaultVisible: true,  pick: (b) => b.fmpP75 },
  { key: "dns",            label: "DNS",       color: "#0ea5e9", defaultVisible: false, pick: (b) => b.dnsP75 },
  { key: "tcp",            label: "TCP",       color: "#10b981", defaultVisible: false, pick: (b) => b.tcpP75 },
  { key: "ssl",            label: "SSL",       color: "#f59e0b", defaultVisible: false, pick: (b) => b.sslP75 },
  { key: "ttfb",           label: "TTFB",      color: "#a855f7", defaultVisible: false, pick: (b) => b.ttfbP75 },
  { key: "contentDownload",label: "内容下载",   color: "#14b8a6", defaultVisible: false, pick: (b) => b.contentDownloadP75 },
  { key: "domParse",       label: "DOM 解析",   color: "#ec4899", defaultVisible: false, pick: (b) => b.domParseP75 },
  { key: "resourceLoad",   label: "资源下载",   color: "#8b5cf6", defaultVisible: false, pick: (b) => b.resourceLoadP75 },
  { key: "lcp",            label: "LCP",       color: "#ef4444", defaultVisible: false, pick: (b) => b.lcpP75 },
  { key: "fcp",            label: "FCP",       color: "#22c55e", defaultVisible: false, pick: (b) => b.fcpP75 },
  { key: "fid",            label: "FID",       color: "#94a3b8", defaultVisible: false, pick: (b) => b.fidP75 },
  { key: "tti",            label: "TTI",       color: "#64748b", defaultVisible: false, pick: (b) => b.ttiP75 },
  { key: "tbt",            label: "TBT",       color: "#d946ef", defaultVisible: false, pick: (b) => b.tbtP75 },
  { key: "inp",            label: "INP",       color: "#eab308", defaultVisible: false, pick: (b) => b.inpP75 },
] as const;

const CLS_COLOR = "#6366f1";
const CLS_LABEL = "CLS";
const SAMPLE_COUNT_COLOR = "#93c5fd";
const SAMPLE_COUNT_LABEL = "样本数";

interface MsDatum {
  readonly hour: string;
  readonly series: string;
  readonly value: number;
}
interface ClsDatum {
  readonly hour: string;
  readonly cls: number;
}
interface BarDatum {
  readonly hour: string;
  readonly sampleCount: number;
}

export function TrendChart({ buckets }: { buckets: readonly TrendBucket[] }) {
  const searchParams = useSearchParams();
  // 标题时间短语与顶栏时间选择保持一致（支持预设 + 自定义区间）
  const timePhrase = useMemo(
    () =>
      getSelectionPhrase(
        parseTimeSelection(new URLSearchParams(searchParams.toString())),
      ),
    [searchParams],
  );

  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>(() => {
    const init: Record<SeriesKey, boolean> = {
      sampleCount: true,
      cls: true,
    } as Record<SeriesKey, boolean>;
    for (const s of MS_SERIES) init[s.key] = s.defaultVisible;
    return init;
  });

  // 跨度超过一天时标签带 MM-DD，否则仅 HH:00 避免挤占
  const hourFormat = useMemo<string>(() => {
    if (buckets.length < 2) return "HH:00";
    const first = dayjs(buckets[0]!.hour);
    const last = dayjs(buckets[buckets.length - 1]!.hour);
    return last.diff(first, "day") >= 1 ? "MM-DD HH:00" : "HH:00";
  }, [buckets]);

  const activeMsSeries = useMemo(
    () => MS_SERIES.filter((s) => visible[s.key]),
    [visible],
  );
  const sampleVisible = visible.sampleCount;
  const clsVisible = visible.cls;

  // === 各视图数据 ===
  const msData = useMemo<MsDatum[]>(() => {
    if (activeMsSeries.length === 0) return [];
    const rows: MsDatum[] = [];
    for (const b of buckets) {
      const hh = dayjs(b.hour).format(hourFormat);
      for (const s of activeMsSeries) {
        rows.push({ hour: hh, series: s.label, value: s.pick(b) });
      }
    }
    return rows;
  }, [buckets, activeMsSeries, hourFormat]);

  const clsData = useMemo<ClsDatum[]>(() => {
    if (!clsVisible) return [];
    return buckets.map((b) => ({
      hour: dayjs(b.hour).format(hourFormat),
      // 项目口径：CLS 原值 0~1（对齐 core-vitals 面板、vital-cards、SPEC）
      cls: Math.round(b.clsP75 * 1000) / 1000,
    }));
  }, [buckets, clsVisible, hourFormat]);

  const barData = useMemo<BarDatum[]>(() => {
    if (!sampleVisible) return [];
    return buckets.map((b) => ({
      hour: dayjs(b.hour).format(hourFormat),
      sampleCount: b.sampleCount,
    }));
  }, [buckets, sampleVisible, hourFormat]);

  // === 各轴 domain：[0, 向上取整的最大值]，避免 G2 自动对称 padding 把 0 拉到中间 ===
  const msDomainMax = useMemo<number>(() => {
    if (msData.length === 0) return 100;
    const max = Math.max(...msData.map((d) => d.value), 0);
    if (max <= 0) return 100;
    const step = max > 1000 ? 500 : max > 100 ? 100 : 10;
    return Math.ceil(max / step) * step;
  }, [msData]);

  const clsDomainMax = useMemo<number>(() => {
    if (clsData.length === 0) return 0.25;
    const max = Math.max(...clsData.map((d) => d.cls), 0);
    if (max <= 0) return 0.25;
    // 对齐 web-vitals 阈值：0.1 / 0.25 / 0.5 / 1；向上取到下一个阈值更清晰
    if (max <= 0.1) return 0.1;
    if (max <= 0.25) return 0.25;
    if (max <= 0.5) return 0.5;
    return 1;
  }, [clsData]);

  const barDomainMax = useMemo<number>(() => {
    if (barData.length === 0) return 10;
    const max = Math.max(...barData.map((d) => d.sampleCount), 0);
    if (max <= 0) return 10;
    const step = max > 1000 ? 500 : max > 100 ? 50 : 10;
    return Math.ceil(max / step) * step;
  }, [barData]);

  // === 动态组合 children：未选中的轴不渲染，避免空轴残留 ===
  // 约定 x 轴仅由第一个可见子视图渲染，其余 `axis.x = false`
  const children = useMemo(() => {
    const views: unknown[] = [];
    // DualAxes 的 x 轴必须由某个子视图渲染（顶层 axis.x 不生效）
    // 仅让第一个可见子视图输出 x 轴，其余子视图关闭以避免重复
    let xRendered = false;
    const nextXAxis = (): unknown => {
      if (xRendered) return false as const;
      xRendered = true;
      return {
        title: "时间",
        titleFontSize: 10,
        labelFontSize: 10,
        // 时间标签容易拥挤，允许自动旋转避免被省略或剪裁
        labelAutoRotate: true,
        labelAutoHide: false,
      };
    };

    if (activeMsSeries.length > 0) {
      views.push({
        data: msData,
        type: "line",
        yField: "value",
        colorField: "series",
        shapeField: "smooth",
        style: { lineWidth: 2 },
        scale: {
          color: {
            domain: activeMsSeries.map((s) => s.label),
            range: activeMsSeries.map((s) => s.color),
          },
          y: { domain: [0, msDomainMax] as const, nice: true },
        },
        axis: {
          x: nextXAxis(),
          y: {
            position: "left" as const,
            title: "耗时（ms）",
            titleFontSize: 10,
            labelFontSize: 10,
          },
        },
        // 多折线共享 tooltip 下，name 必须按 datum.series 动态解析
        // 固定字符串会让每行都显示相同标签（例如全部 "p75"）
        tooltip: {
          title: (d: { hour: string }) => d.hour,
          items: [
            (d: { series: string; value: number }) => ({
              name: d.series,
              value: `${d.value} ms`,
            }),
          ],
        },
      });
    }

    if (clsVisible) {
      views.push({
        data: clsData,
        type: "line",
        yField: "cls",
        style: { stroke: CLS_COLOR, lineWidth: 2 },
        scale: {
          y: { domain: [0, clsDomainMax] as const, nice: true },
        },
        axis: {
          x: nextXAxis(),
          y: {
            position: "right" as const,
            title: "CLS 评分",
            titleFontSize: 10,
            labelFontSize: 10,
            labelFormatter: (v: number) => v.toFixed(2),
          },
        },
        tooltip: {
          title: (d: { hour: string }) => d.hour,
          items: [
            (d: { cls: number }) => ({
              name: CLS_LABEL,
              value: d.cls.toFixed(3),
            }),
          ],
        },
      });
    }

    if (sampleVisible) {
      views.push({
        data: barData,
        type: "interval",
        yField: "sampleCount",
        style: {
          fill: SAMPLE_COUNT_COLOR,
          fillOpacity: 0.55,
          maxWidth: 18,
          radiusTopLeft: 2,
          radiusTopRight: 2,
        },
        scale: {
          y: { domain: [0, barDomainMax] as const, nice: true },
        },
        axis: {
          x: nextXAxis(),
          y: {
            position: "right" as const,
            title: "样本数（次）",
            titleFontSize: 10,
            labelFontSize: 10,
            labelFormatter: (v: number) => v.toLocaleString(),
          },
        },
        tooltip: {
          title: (d: { hour: string }) => d.hour,
          items: [
            (d: { sampleCount: number }) => ({
              // tooltip 文描：柱状图用"样本"（非"样本数"）以与图例区分
              name: "样本",
              value: d.sampleCount.toLocaleString(),
            }),
          ],
        },
      });
    }

    return views;
  }, [
    activeMsSeries,
    msData,
    msDomainMax,
    clsVisible,
    clsData,
    clsDomainMax,
    sampleVisible,
    barData,
    barDomainMax,
  ]);

  const config = useMemo(
    () => ({
      xField: "hour",
      height: 300,
      legend: false as const,
      children,
      interaction: { tooltip: { shared: true } },
    }),
    [children],
  );

  if (buckets.length === 0) return null;

  const nothingVisible =
    !sampleVisible && !clsVisible && activeMsSeries.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>性能视图 · {timePhrase}</CardTitle>
        <div className="text-muted-foreground text-xs">
          默认展示「样本数 · CLS · 首屏时间」；左轴「耗时（ms）」· 右轴「CLS 评分」「样本数」—— 点击下方图例切换系列与对应坐标轴
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {/* 样本数（柱状）—— 方块图例与折线圆点图例区分 */}
          <LegendChip
            label={SAMPLE_COUNT_LABEL}
            color={SAMPLE_COUNT_COLOR}
            active={sampleVisible}
            shape="square"
            onToggle={() =>
              setVisible((prev) => ({
                ...prev,
                sampleCount: !prev.sampleCount,
              }))
            }
          />
          {/* CLS（独立右轴，不混入 ms 系列） */}
          <LegendChip
            label={CLS_LABEL}
            color={CLS_COLOR}
            active={clsVisible}
            shape="dot"
            onToggle={() =>
              setVisible((prev) => ({ ...prev, cls: !prev.cls }))
            }
          />
          {MS_SERIES.map((s) => (
            <LegendChip
              key={s.key}
              label={s.label}
              color={s.color}
              active={visible[s.key]}
              shape="dot"
              onToggle={() =>
                setVisible((prev) => ({ ...prev, [s.key]: !prev[s.key] }))
              }
            />
          ))}
        </div>

        {nothingVisible ? (
          <div className="text-muted-foreground flex h-[300px] items-center justify-center text-xs">
            请从上方图例启用至少一个系列
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
        className={cn("size-2", shape === "square" ? "rounded-sm" : "rounded-full")}
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
