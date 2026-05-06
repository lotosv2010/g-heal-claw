import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  LoadStage,
  LongTaskSummary,
  VitalMetric,
} from "@/lib/api/performance";

/**
 * 常用指标卡片（列于页面顶部）
 *
 * 数据来源（ADR-0015 概览接口）：
 *  - 首屏时间（FMP）   ← stages.firstScreen.ms
 *  - 首字节（TTFB）    ← vitals.TTFB.value
 *  - DOM Ready         ← stages.domParse.endMs
 *  - 页面完全加载      ← 所有 stages 中最大的 endMs
 *  - 总阻塞时间（TBT） ← vitals.TBT.value
 *  - 长任务           ← longTasks.count / totalMs
 *  - 采样数量          ← vitals 中 sampleCount 的最大值（ADR-0015 中同源）
 *
 * 所有字段缺失时显式展示 "N/A"，不编造数据。
 */
export interface CommonMetricsCardsProps {
  readonly vitals: readonly VitalMetric[];
  readonly stages: readonly LoadStage[];
  readonly longTasks: LongTaskSummary;
}

export function CommonMetricsCards({
  vitals,
  stages,
  longTasks,
}: CommonMetricsCardsProps) {
  const stageOf = (key: LoadStage["key"]) => stages.find((s) => s.key === key);
  const vitalOf = (key: VitalMetric["key"]) => vitals.find((v) => v.key === key);

  const fmpMs = stageOf("firstScreen")?.ms;
  const ttfb = vitalOf("TTFB");
  const domReadyMs = stageOf("domParse")?.endMs;
  const fullyLoadedMs = stages.reduce<number | undefined>(
    (acc, s) => (acc === undefined ? s.endMs : Math.max(acc, s.endMs)),
    undefined,
  );
  const sampleCount = vitals.reduce<number>(
    (acc, v) => Math.max(acc, v.sampleCount),
    0,
  );
  const tbt = vitalOf("TBT");

  const cards: readonly {
    readonly label: string;
    readonly hint: string;
    readonly value: string;
    readonly tiers?: LongTaskSummary["tiers"] | null;
  }[] = [
    {
      label: "首屏时间（FMP）",
      hint: "平均首屏渲染耗时",
      value: formatMs(fmpMs),
    },
    {
      label: "首字节（TTFB）",
      hint: "Time to First Byte · p75",
      value: ttfb ? formatMs(ttfb.value) : "N/A",
    },
    {
      label: "DOM Ready",
      hint: "DOMContentLoaded 时间点",
      value: formatMs(domReadyMs),
    },
    {
      label: "页面完全加载",
      hint: "load 事件或资源加载完成",
      value: formatMs(fullyLoadedMs),
    },
    {
      label: "总阻塞时间（TBT）",
      hint: "Lighthouse · FCP~TTI 长任务累计",
      value: tbt && tbt.sampleCount > 0 ? formatMs(tbt.value) : "N/A",
    },
    {
      label: "长任务",
      hint:
        longTasks.count > 0
          ? `累计 ${formatMs(longTasks.totalMs)} · p75 ${formatMs(longTasks.p75Ms)}`
          : "窗口内无长任务样本",
      value:
        longTasks.count > 0 ? `${longTasks.count.toLocaleString()} 次` : "0 次",
      tiers: longTasks.count > 0 ? longTasks.tiers : null,
    },
    {
      label: "采样数量",
      hint: "当前时间窗口内样本数",
      value: sampleCount > 0 ? sampleCount.toLocaleString() : "0",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-7">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-xs font-medium">
              {c.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-foreground text-2xl font-semibold tabular-nums">
              {c.value}
            </div>
            {"tiers" in c && c.tiers && <LongTaskTierBar tiers={c.tiers} />}
            <div className="text-muted-foreground mt-1 whitespace-pre-line text-xs">
              {c.hint}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** 长任务三级分布条（ADR-0018 P0.2） */
function LongTaskTierBar({ tiers }: { readonly tiers: LongTaskSummary["tiers"] }) {
  const total = tiers.longTask + tiers.jank + tiers.unresponsive;
  if (total === 0) return null;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex h-2 w-full overflow-hidden rounded-full">
        {tiers.longTask > 0 && (
          <div className="bg-emerald-500" style={{ width: pct(tiers.longTask) }} title={`长任务 ${tiers.longTask}`} />
        )}
        {tiers.jank > 0 && (
          <div className="bg-amber-500" style={{ width: pct(tiers.jank) }} title={`卡顿 ${tiers.jank}`} />
        )}
        {tiers.unresponsive > 0 && (
          <div className="bg-rose-500" style={{ width: pct(tiers.unresponsive) }} title={`无响应 ${tiers.unresponsive}`} />
        )}
      </div>
      <div className="flex gap-3 text-[10px]">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />{tiers.longTask}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" />{tiers.jank}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-rose-500" />{tiers.unresponsive}</span>
      </div>
    </div>
  );
}

/** 统一毫秒格式化：>= 1000ms 转秒保留 2 位，undefined 展示 N/A */
function formatMs(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return "N/A";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.round(ms)} ms`;
}
