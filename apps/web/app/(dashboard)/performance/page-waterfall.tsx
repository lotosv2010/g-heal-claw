"use client";

import { useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LoadStage } from "@/lib/api/performance";

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
 */
export function PageWaterfall({ stages }: { stages: readonly LoadStage[] }) {
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
                name: "耗时",
                valueFormatter: (v: number) => `${v} ms`,
              },
              {
                field: "startMs",
                name: "开始",
                valueFormatter: (v: number) => `${v} ms`,
              },
              {
                field: "endMs",
                name: "结束",
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
        <CardTitle>页面加载瀑布图</CardTitle>
        <div className="text-muted-foreground text-xs">
          共 <span className="text-foreground tabular-nums">{total}</span> ms · 阶段累积时序
        </div>
      </CardHeader>
      <CardContent>
        <div ref={containerRef} className="h-[320px] w-full" />
      </CardContent>
    </Card>
  );
}
