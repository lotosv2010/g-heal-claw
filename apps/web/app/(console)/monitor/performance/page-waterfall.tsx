"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info } from "lucide-react";
import type { LoadStage, SlowPage } from "@/lib/api/performance";

// 低饱和色板（Tailwind/AntD 对应色 300~400 区间）——
// 参考：信息密度高的瀑布图强调区分而非高对比，低饱和更易阅读
const STAGE_COLORS = [
  "#93c5fd", // DNS 查询   · blue-300
  "#86efac", // TCP 连接   · green-300
  "#fcd34d", // SSL 建连   · amber-300
  "#c4b5fd", // 请求响应   · violet-300
  "#5eead4", // 内容传输   · teal-300
  "#f9a8d4", // 内容解析   · pink-300
  "#fdba74", // 资源加载   · orange-300
  "#818cf8", // 首屏耗时   · indigo-400（整体指标，略重以区分序列）
  "#fca5a5", // LCP        · red-300（核心指标，保留红色语义但降饱和）
] as const;

/**
 * 页面加载瀑布图（PRD §2.1）
 *
 * G2 v5 横向甘特/瀑布图标准写法：
 * 1. interval mark 默认竖直，range 要编码到 `y`（`['startMs','endMs']`）
 * 2. 通过 `coordinate.transpose` 旋转 90° 即得到横向条
 * 3. 翻转后 x/y 对调：类目在"y 轴"（视觉左侧）、时间区间在"x 轴"（视觉底部）
 *
 * 计算方式（ADR-0018 P2.2）：
 * - Navigation 串联阶段（DNS / TCP / SSL / 请求 / 响应 / 解析 / 资源）取窗口内采样的 p75 串联累积
 * - 首屏 / LCP 取同窗口 vital p75，单独起点为 0（整段时间轴的右界）
 * - 选 p75 是稳定性优先而非压线：更贴近 Core Web Vitals 通行口径
 * - `metric_minute` 预聚合路径被 T2.1.8 排除（见 ADR-0018 Excluded）；
 *   启用后将替换此处运行时聚合——届时本组件只做渲染、不再依赖 overview live 计算。
 */
/** 所有页面聚合的占位值 */
const ALL_PAGES_VALUE = "__all__";

export function PageWaterfall({
  stages,
  slowPages = [],
}: {
  stages: readonly LoadStage[];
  slowPages?: readonly SlowPage[];
}) {
  const [selectedPage, setSelectedPage] = useState<string>(ALL_PAGES_VALUE);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 总耗时 = 所有阶段 endMs 的最大值（"首屏耗时"/"LCP" 从 0 开始累计，代表整段时间轴的右界）
  const total = stages.reduce((acc, s) => Math.max(acc, s.endMs), 0);

  const data = useMemo(
    () =>
      stages.map((s) => ({
        label: s.label,
        startMs: s.startMs,
        endMs: s.endMs,
        ms: s.ms,
      })),
    [stages],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    let disposed = false;
    let chartRef: { destroy: () => void } | null = null;

    (async () => {
      try {
        const { Chart } = await import("@antv/g2");
        if (disposed) return;

        const chart = new Chart({
          container,
          autoFit: true,
          height: 320,
          paddingLeft: 96,
          paddingRight: 24,
          paddingTop: 36, // 顶部时间轴腾出空间
          paddingBottom: 24,
        });

        // 关键：coordinate transpose → 转成横向；label 在 x(类目)、range 在 y(区间)
        chart.coordinate({ transform: [{ type: "transpose" }] });

        chart
          .interval()
          .data(data)
          .encode("x", "label")
          .encode("y", ["startMs", "endMs"])
          .encode("color", "label")
          .scale("color", {
            domain: stages.map((s) => s.label),
            range: STAGE_COLORS.slice(0, stages.length),
          })
          // x 轴（转置后视觉在左）保持阶段时序
          .scale("x", { domain: stages.map((s) => s.label) })
          .axis("x", { title: null, labelFontSize: 12 })
          // transpose 后 y 轴在视觉底部（时间轴）→ 开启纵向网格线
          // 位置设为 top：时间刻度置于色条上方，与瀑布图业界习惯对齐
          .axis("y", {
            title: "ms",
            position: "top",
            labelFontSize: 10,
            grid: true,
            gridStroke: "#9ca3af", // gray-400（较 gray-200 更深，可读性提升）
            gridStrokeOpacity: 0.7,
            gridLineDash: [0, 0],
          })
          .style("radius", 4)
          .legend(false)
          .tooltip({
            title: (d: { label: string }) => d.label,
            items: [
              {
                field: "ms",
                name: "p75 耗时",
                valueFormatter: (v: number) => `${v} ms`,
              },
              {
                field: "startMs",
                name: "开始（累积 p75）",
                valueFormatter: (v: number) => `${v} ms`,
              },
              {
                field: "endMs",
                name: "结束（累积 p75）",
                valueFormatter: (v: number) => `${v} ms`,
              },
            ],
          });

        await chart.render();
        chartRef = chart;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[PageWaterfall] 渲染失败：", err);
      }
    })();

    return () => {
      disposed = true;
      chartRef?.destroy();
    };
  }, [data, stages]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5">
              <CardTitle>页面加载瀑布图</CardTitle>
              <Tooltip>
                <TooltipTrigger
                  aria-label="查看计算方式"
                  className="text-muted-foreground hover:text-foreground inline-flex"
                >
                  <Info className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[320px] text-xs leading-relaxed">
                  <p>
                    串联阶段取窗口内 Navigation 采样的 <span className="font-medium">p75</span> 依次累积；
                    首屏 / LCP 直接取同窗口 vital p75。
                  </p>
                  <p className="mt-1.5">
                    选 p75 而非 p50 为稳定性优先，贴合 Core Web Vitals 口径。
                    <br />
                    <span className="text-muted-foreground">
                      后续 <code className="rounded bg-muted px-1 py-0.5">metric_minute</code> 预聚合启用后将替换此运行时计算（ADR-0018）。
                    </span>
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="text-muted-foreground mt-1 text-xs">
              共 <span className="text-foreground tabular-nums">{total}</span> ms · 阶段累积时序（p75）
              {selectedPage !== ALL_PAGES_VALUE && (
                <span className="text-primary ml-2">· 已选定页面上下文</span>
              )}
            </div>
          </div>
          {/* 页面选择下拉：选择慢页面 URL 以提供上下文聚焦 */}
          {slowPages.length > 0 && (
            <Select value={selectedPage} onValueChange={setSelectedPage}>
              <SelectTrigger className="w-[260px] shrink-0">
                <SelectValue placeholder="全部页面（聚合）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PAGES_VALUE}>全部页面（聚合）</SelectItem>
                {slowPages.map((page) => (
                  <SelectItem key={page.url} value={page.url}>
                    <span className="truncate" title={page.url}>
                      {truncateUrl(page.url)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div ref={containerRef} className="h-[320px] w-full" />
      </CardContent>
    </Card>
  );
}

/** 截断 URL 以适配下拉宽度，保留路径部分 */
function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    // 仅显示 pathname（去掉域名），超长则截断
    if (path.length > 40) return path.slice(0, 37) + "...";
    return path || "/";
  } catch {
    // 非标准 URL 直接截断
    if (url.length > 40) return url.slice(0, 37) + "...";
    return url;
  }
}
