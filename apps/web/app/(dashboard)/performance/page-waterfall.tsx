"use client";

import { useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LoadStage } from "@/lib/api/performance";

// AntV G2 Category-10 色板（9 色对应 9 个阶段；最后两条为整体指标，取更深的语义色）
const STAGE_COLORS = [
  "#1677ff", // DNS 查询   · Blue-6
  "#52c41a", // TCP 连接   · Green-6
  "#faad14", // SSL 建连   · Gold-6
  "#722ed1", // 请求响应   · Purple-6
  "#13c2c2", // 内容传输   · Cyan-6
  "#eb2f96", // 内容解析   · Magenta-6
  "#fa541c", // 资源加载   · Volcano-6
  "#2f54eb", // 首屏耗时   · Geekblue-6（整体指标）
  "#f5222d", // LCP        · Red-6（核心指标强调）
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
          paddingTop: 16,
          paddingBottom: 40,
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
          .axis("y", { title: "ms", labelFontSize: 10 })
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
