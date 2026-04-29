"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { VitalKey, VitalMetric } from "@/lib/api/performance";

// 指针 / 分界线统一视觉色（AntD neutral-8）
const POINTER_COLOR = "#434343";

/**
 * Core Web Vitals 面板（参考腾讯云 RUM `.web-vitals-container > .item`）
 *
 * 每个 item 结构：
 *  - `.data`      顶部数值（按 bucket 着色：good / ni / poor）
 *  - `.title`     指标名称 + hover 解释 tip（原生 title）
 *  - `.content`   三等宽阈值块：good / ni / poor
 *      ∙ good/ni 块右边缘显示阈值上界（pointer）
 *      ∙ 当前值所在块内叠加 `pointer.current`，位置 = 值在该 bucket 区间的相对百分比
 *
 * 阈值来源 web.dev 官方标准：
 *  - LCP  good ≤ 2500ms  / needs ≤ 4000ms
 *  - FID  good ≤ 100ms   / needs ≤ 300ms
 *  - CLS  good ≤ 0.1     / needs ≤ 0.25
 *  - FCP  good ≤ 1800ms  / needs ≤ 3000ms
 *  - TTI  good ≤ 3800ms  / needs ≤ 7300ms
 *  - INP  good ≤ 200ms   / needs ≤ 500ms
 *
 * FID / TTI 不在当前 PerformanceOverview 契约内 → value=N/A，不显示 current 指针。
 */

interface VitalConfig {
  readonly key: VitalKey;
  readonly full: string;
  readonly desc: string;
  readonly unit: "ms" | "";
  readonly thresholds: readonly [number, number];
  /** poor 段视觉上界（仅用于 current 在 poor 区间时定位，非阈值） */
  readonly poorCap: number;
  /** 已废弃指标标记（面板渲染「已废弃」灰色 tag，tooltip 说明替代指标） */
  readonly deprecated?: boolean;
  /** 废弃时的替代指标（填充至 tooltip 提示文案） */
  readonly replacedBy?: string;
}

// 面板展示顺序（业务规范）：LCP → INP → CLS → TTFB → FCP → TTI → TBT → FID → SI
const CONFIGS: readonly VitalConfig[] = [
  {
    key: "LCP",
    full: "Largest Contentful Paint",
    desc: "最大内容绘制：视口中最大元素完成渲染的时间，衡量加载性能。",
    unit: "ms",
    thresholds: [2500, 4000],
    poorCap: 8000,
  },
  {
    key: "INP",
    full: "Interaction to Next Paint",
    desc: "交互响应延迟：页面整体交互响应时间，FID 的继任指标，衡量交互性。",
    unit: "ms",
    thresholds: [200, 500],
    poorCap: 1200,
  },
  {
    key: "CLS",
    full: "Cumulative Layout Shift",
    desc: "累积布局偏移：页面生命周期内意外布局偏移量总和，衡量视觉稳定性。",
    unit: "",
    thresholds: [0.1, 0.25],
    poorCap: 1,
  },
  {
    key: "TTFB",
    full: "Time to First Byte",
    desc: "首字节时间：从导航开始到收到响应首字节的时间，衡量后端 + 网络延迟。",
    unit: "ms",
    thresholds: [800, 1800],
    poorCap: 4000,
  },
  {
    key: "FCP",
    full: "First Contentful Paint",
    desc: "首次内容绘制：首个 DOM 内容（文字/图像）绘制到屏幕的时间。",
    unit: "ms",
    thresholds: [1800, 3000],
    poorCap: 6000,
  },
  {
    key: "TTI",
    full: "Time to Interactive",
    desc: "可交互时间：页面达到完全可交互状态所需的时间。",
    unit: "ms",
    thresholds: [3800, 7300],
    poorCap: 15000,
  },
  {
    key: "TBT",
    full: "Total Blocking Time",
    desc: "总阻塞时间：FCP~TTI 窗口内长任务阻塞时长累计（Lighthouse 口径），与 INP 强相关。",
    unit: "ms",
    thresholds: [200, 600],
    poorCap: 2000,
  },
  {
    key: "FID",
    full: "First Input Delay",
    desc: "首次输入延迟：用户首次交互到浏览器响应的时间。已被 INP 取代，工具中仍可见。",
    unit: "ms",
    thresholds: [100, 300],
    poorCap: 1000,
    deprecated: true,
    replacedBy: "INP",
  },
  {
    key: "SI",
    full: "Speed Index",
    desc: "速度指数：衡量视窗内内容可见速度。Lighthouse 实验室口径基于视频帧；SDK 侧用 FP/FCP/LCP 三里程碑 AUC 近似，精度低于实验室版本，偏差约 ±20%，仅供趋势参考。",
    unit: "ms",
    thresholds: [3400, 5800],
    poorCap: 10000,
  },
] as const;

export function CoreVitalsPanel({ metrics }: { metrics: readonly VitalMetric[] }) {
  const byKey = new Map<string, VitalMetric>(metrics.map((m) => [m.key, m]));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Core Web Vitals</CardTitle>
        <div className="text-muted-foreground text-xs">
          三段式阈值 · GOOD / NEEDS IMPROVEMENT / POOR · 悬停名称查看指标解释
        </div>
      </CardHeader>
      <CardContent>
        <ul className="grid list-none grid-cols-1 gap-x-6 gap-y-8 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {CONFIGS.map((cfg) => (
            <VitalItem
              key={cfg.key}
              config={cfg}
              metric={byKey.get(cfg.key)}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

type Bucket = "good" | "ni" | "poor" | "unknown";

function VitalItem({
  config,
  metric,
}: {
  config: VitalConfig;
  metric: VitalMetric | undefined;
}) {
  const [goodMax, niMax] = config.thresholds;
  const value = metric?.value;
  const hasValue = value !== undefined && Number.isFinite(value);
  const bucket: Bucket = hasValue ? classify(value, config.thresholds) : "unknown";
  const currentPctInBucket = hasValue
    ? bucketOffsetPercent(value, config)
    : null;

  // 数值按 bucket 着色：good=绿 / ni=黄 / poor=红 / unknown=灰
  // 与色块底色保持一致（bg-*-500/85 对应 text-*-500）
  const valueColorClass =
    bucket === "good"
      ? "text-emerald-500"
      : bucket === "ni"
        ? "text-amber-500"
        : bucket === "poor"
          ? "text-red-500"
          : "text-muted-foreground";

  return (
    <li className="flex flex-col gap-2">
      {/* 顶部行：指标名（蓝色 + 下划线 + shadcn Tooltip）左对齐 ｜ 数值按色块色右对齐 */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="cursor-help underline decoration-solid underline-offset-4 outline-none"
                style={{ color: "#2a7aff", fontSize: 20, fontWeight: 700 }}
                aria-label={`${config.key} 解释`}
              >
                {config.key}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <div className="text-foreground text-xs font-semibold">
                {config.full}
                {config.deprecated ? (
                  <span className="text-muted-foreground ml-1 font-normal">
                    · 已废弃
                  </span>
                ) : null}
              </div>
              <div className="text-muted-foreground mt-1 leading-relaxed">
                {config.desc}
              </div>
              {config.deprecated && config.replacedBy ? (
                <div className="text-muted-foreground mt-1 leading-relaxed">
                  推荐使用 <span className="text-foreground">{config.replacedBy}</span> 替代
                </div>
              ) : null}
            </TooltipContent>
          </Tooltip>
          {config.deprecated ? <DeprecatedBadge /> : null}
        </div>
        <span
          className={cn("text-lg font-semibold tabular-nums", valueColorClass)}
        >
          {hasValue ? formatValue(value, config.unit) : "N/A"}
        </span>
      </div>

      {/* .content：三等宽色条 + 下方指针层（分界 35px / 当前值 55px，均为 #434343） */}
      <div className="relative pb-20">
        {/* 三等宽色条：无间距、整体圆角 */}
        <div className="flex h-[50px] w-full overflow-hidden rounded-sm">
          <RangeBlock label="GOOD" bg="bg-emerald-500/85" />
          <RangeBlock label={<>NEEDS<br />IMPROVEMENT</>} bg="bg-amber-500/85" />
          <RangeBlock label="POOR" bg="bg-red-500/85" />
        </div>

        {/* 分界阈值指针：圆点(上) + 竖线(下) · 2×35px · 黑色 */}
        <ThresholdDivider leftPct={100 / 3} text={formatValue(goodMax, config.unit)} />
        <ThresholdDivider leftPct={(100 / 3) * 2} text={formatValue(niMax, config.unit)} />

        {/* 当前值指针：圆点(上) + 竖线(下) · 2×55px · 蓝色 */}
        {hasValue && currentPctInBucket !== null && (
          <CurrentPointer
            bucket={bucket as Exclude<Bucket, "unknown">}
            leftPctInBucket={currentPctInBucket}
            text={formatValue(value, config.unit)}
          />
        )}
      </div>
    </li>
  );
}

/** 已废弃指标标签（浅灰底 · deprecated 语义，不占视觉焦点） */
function DeprecatedBadge() {
  return (
    <span className="bg-muted text-muted-foreground inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
      Deprecated
    </span>
  );
}

function RangeBlock({
  label,
  bg,
}: {
  label: React.ReactNode;
  bg: string;
}) {
  return (
    <div className={cn("flex-1", bg)}>
      <div className="flex h-full w-full items-center justify-center text-center text-[11px] font-semibold leading-tight text-white">
        {label}
      </div>
    </div>
  );
}

/**
 * 阈值分界指示（位于色条正下方）
 *  - 规格：2px × 35px · 圆点在上、竖线在下 · 数值在最下
 *  - 水平定位：leftPct 对应的分界点（33.3% / 66.7%），translate-x 居中
 */
function ThresholdDivider({
  leftPct,
  text,
}: {
  leftPct: number;
  text: string;
}) {
  return (
    <div
      className="pointer-events-none absolute top-[50px] flex -translate-x-1/2 flex-col items-center"
      style={{ left: `${leftPct}%` }}
      aria-hidden
    >
      <span
        className="size-[6px] rounded-full"
        style={{ backgroundColor: POINTER_COLOR }}
      />
      <span
        className="h-[35px] w-[2px]"
        style={{ backgroundColor: POINTER_COLOR }}
      />
      <span
        className="mt-0.5 text-[10px] tabular-nums"
        style={{ color: POINTER_COLOR }}
      >
        {text}
      </span>
    </div>
  );
}

/**
 * 当前值指针（位于色条正下方）
 *  - 规格：2px × 55px · 圆点在上、竖线在下 · 数值在最下 · 统一蓝色
 */
function CurrentPointer({
  bucket,
  leftPctInBucket,
  text,
}: {
  bucket: Exclude<Bucket, "unknown">;
  leftPctInBucket: number;
  text: string;
}) {
  // 块起点（good=0, ni=1/3, poor=2/3），再加上块内相对位置占 1/3 容器宽度
  const base = bucket === "good" ? 0 : bucket === "ni" ? 100 / 3 : (100 / 3) * 2;
  const left = base + (leftPctInBucket / 100) * (100 / 3);
  return (
    <div
      className="pointer-events-none absolute top-[50px] flex -translate-x-1/2 flex-col items-center"
      style={{ left: `${left}%` }}
      aria-hidden
    >
      <span className="bg-primary size-[6px] rounded-full" />
      <span className="bg-primary h-[55px] w-[2px]" />
      <span className="text-primary mt-0.5 text-[10px] font-medium tabular-nums">
        {text}
      </span>
    </div>
  );
}

function classify(
  value: number,
  thresholds: readonly [number, number],
): Exclude<Bucket, "unknown"> {
  if (value <= thresholds[0]) return "good";
  if (value <= thresholds[1]) return "ni";
  return "poor";
}

/** 值在其所在 bucket 区间内的相对位置 0~100（夹紧） */
function bucketOffsetPercent(value: number, config: VitalConfig): number {
  const [goodMax, niMax] = config.thresholds;
  if (value <= goodMax) {
    return clamp((value / goodMax) * 100);
  }
  if (value <= niMax) {
    return clamp(((value - goodMax) / (niMax - goodMax)) * 100);
  }
  const cap = Math.max(config.poorCap, niMax + 1);
  return clamp(((value - niMax) / (cap - niMax)) * 100);
}

function clamp(n: number): number {
  if (n < 2) return 2;
  if (n > 98) return 98;
  return n;
}

function formatValue(v: number, unit: "ms" | ""): string {
  // CLS 等无量纲保留 3 位小数（阈值 0.1 / 0.25 精细区分；2 位会把 0.003 显示为 0.00）
  if (unit === "") return v.toFixed(3);
  if (v >= 1000) return `${(v / 1000).toFixed(2)}s`;
  return `${Math.round(v)}ms`;
}
