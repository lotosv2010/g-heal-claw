"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiDimensionRow, ApiDimensions } from "@/lib/api/api";

/**
 * API 维度分布 Tabs（镜像性能 / 异常页面布局）
 *
 * 已接入维度（api_events_raw 列）：
 *  - 浏览器 browser
 *  - 操作系统 os
 *  - 平台 device_type（desktop / mobile / tablet / unknown）
 *
 * 占位 Tab（待采集）：机型 / 浏览器版本 / 操作系统版本 / 地域 / 运营商 / 网络
 *
 * 每个 Tab：左 1/3 环图 · 右 2/3 表格（# / 取值 / 样本数 / 占比 / 均耗时 / 失败率）
 */

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
  { key: "carrier", label: "运营商" },
  { key: "network", label: "网络" },
  { key: "platform", label: "平台" },
] as const;

const PIE_COLORS = [
  "#93c5fd",
  "#86efac",
  "#fcd34d",
  "#c4b5fd",
  "#5eead4",
  "#f9a8d4",
  "#fdba74",
  "#818cf8",
  "#fca5a5",
  "#a1a1aa",
];

export function DimensionTabs({
  dimensions,
}: {
  dimensions: ApiDimensions;
}) {
  const lookup: Record<string, readonly ApiDimensionRow[]> = {
    device: dimensions.platform,
    browser: dimensions.browser,
    os: dimensions.os,
    platform: dimensions.platform,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>维度分布</CardTitle>
        <div className="text-muted-foreground text-xs">
          按 API 请求样本数占比展示 · 浏览器 / 操作系统 / 平台 已接入；其余维度保留占位
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

function DimensionPane({ rows }: { rows: readonly ApiDimensionRow[] }) {
  const pieData = useMemo(
    () =>
      rows.map((r) => ({ type: r.value || "unknown", value: r.sampleCount })),
    [rows],
  );

  const pieConfig = useMemo(
    () => ({
      data: pieData,
      angleField: "value",
      colorField: "type",
      innerRadius: 0.6,
      radius: 0.9,
      height: 260,
      legend: {
        color: {
          position: "bottom" as const,
          layout: { justifyContent: "center" as const },
        },
      },
      scale: { color: { range: PIE_COLORS } },
      label: false as const,
      tooltip: {
        items: [
          {
            field: "value",
            name: "样本数",
            valueFormatter: (v: number) => v.toLocaleString(),
          },
        ],
      },
    }),
    [pieData],
  );

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        此维度尚未采集 · 后续切片将接入 UA 解析 / GeoIP / 网络上报
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <Pie {...pieConfig} />
      </div>
      <div className="lg:col-span-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>取值</TableHead>
              <TableHead className="text-right">样本数</TableHead>
              <TableHead className="text-right">占比</TableHead>
              <TableHead className="text-right">均耗时 (ms)</TableHead>
              <TableHead className="text-right">失败率</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.value}>
                <TableCell className="text-muted-foreground tabular-nums">
                  {i + 1}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.value}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.sampleCount.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.sharePercent.toFixed(2)}%
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {r.avgDurationMs > 0
                    ? Math.round(r.avgDurationMs).toLocaleString()
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span
                    className={
                      r.failureRatio > 0
                        ? "text-red-600"
                        : "text-muted-foreground"
                    }
                  >
                    {(r.failureRatio * 100).toFixed(1)}%
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

