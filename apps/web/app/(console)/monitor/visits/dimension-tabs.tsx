"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useChartTheme } from "@/lib/use-chart-theme";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { VisitsDimensionRow, VisitsDimensions } from "@/lib/api/visits";

const Pie = dynamic(() => import("@ant-design/plots").then((m) => m.Pie), {
  ssr: false,
  loading: () => <Skeleton className="h-60 w-full" />,
});

// 维度 Tab 配置（与 /monitor/errors 统一 8 项）
const TABS = [
  { key: "device", label: "机型" },
  { key: "browser", label: "浏览器" },
  { key: "os", label: "操作系统" },
  { key: "version", label: "版本" },
  { key: "region", label: "地域" },
  { key: "network", label: "网络" },
  { key: "platform", label: "平台" },
] as const;

const PIE_COLORS = [
  "#93c5fd", "#86efac", "#fcd34d", "#c4b5fd", "#5eead4",
  "#f9a8d4", "#fdba74", "#818cf8", "#fca5a5", "#a1a1aa",
];

export function DimensionTabs({ dimensions }: { dimensions: VisitsDimensions }) {
  const lookup = dimensions as unknown as Record<string, readonly VisitsDimensionRow[]>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>维度分布</CardTitle>
        <div className="text-muted-foreground text-xs">
          按 PV 占比展示 · 浏览器 / 操作系统 / 平台 已接入；其余维度保留占位
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="device">
          <TabsList className="mb-4 flex w-full flex-wrap justify-start">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map((t) => (
            <TabsContent key={t.key} value={t.key}>
              <DimensionPane rows={lookup[t.key] ?? []} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function DimensionPane({ rows }: { rows: readonly VisitsDimensionRow[] }) {
  const chartTheme = useChartTheme();
  const pieData = useMemo(
    () => rows.map((r) => ({ type: r.value || "unknown", value: r.pv })),
    [rows],
  );

  const pieConfig = useMemo(() => ({
    data: pieData,
    angleField: "value",
    colorField: "type",
    innerRadius: 0.6,
    radius: 0.9,
    height: 260,
    theme: chartTheme,
    legend: { color: { position: "bottom" as const, layout: { justifyContent: "center" as const } } },
    scale: { color: { range: PIE_COLORS } },
    label: false as const,
    tooltip: { items: [{ field: "value", name: "PV", valueFormatter: (v: number) => v.toLocaleString() }] },
  }), [pieData, chartTheme]);

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        当前时间窗口内暂无该维度数据
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1"><Pie {...pieConfig} /></div>
      <div className="lg:col-span-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>取值</TableHead>
              <TableHead className="text-right">PV</TableHead>
              <TableHead className="text-right">UV</TableHead>
              <TableHead className="text-right">占比</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.value}>
                <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell className="font-mono text-xs">{r.value}</TableCell>
                <TableCell className="text-right tabular-nums">{r.pv.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.uv.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.sharePercent.toFixed(2)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
