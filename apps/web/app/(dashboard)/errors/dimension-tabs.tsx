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
import type {
  ErrorDimensionKey,
  ErrorDimensionRow,
  ErrorDimensions,
} from "@/lib/api/errors";

/**
 * 异常维度分布（SPEC 第 4 区）
 *
 * Tabs 顺序固定：机型 / 浏览器 / 操作系统 / 版本 / 地域 / 运营商 / 网络 / 平台
 * 每个 Tab 内：左 1/3 环图 · 右 2/3 表格（# / 取值 / 占比 / 影响会话数）
 *
 * server 端已聚合：device（device_type 列）/ browser / os 三项；
 * 其余 5 项（version / region / carrier / network / platform）保留 "待采集" 占位，待上报字段扩展。
 */

const Pie = dynamic(() => import("@ant-design/plots").then((m) => m.Pie), {
  ssr: false,
  loading: () => <Skeleton className="h-60 w-full" />,
});

interface TabDef {
  readonly key: ErrorDimensionKey;
  readonly label: string;
}

const TABS: readonly TabDef[] = [
  { key: "device", label: "机型" },
  { key: "browser", label: "浏览器" },
  { key: "os", label: "操作系统" },
  { key: "version", label: "版本" },
  { key: "region", label: "地域" },
  { key: "carrier", label: "运营商" },
  { key: "network", label: "网络" },
  { key: "platform", label: "平台" },
];

const PIE_COLORS = [
  "#fca5a5",
  "#fcd34d",
  "#86efac",
  "#93c5fd",
  "#c4b5fd",
  "#f9a8d4",
  "#fdba74",
  "#5eead4",
  "#818cf8",
  "#a1a1aa",
];

export function DimensionTabs({
  dimensions,
}: {
  dimensions: ErrorDimensions;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>维度分布</CardTitle>
        <div className="text-muted-foreground text-xs">
          按异常事件数占比展示 · 机型 / 浏览器 / 操作系统 已接入；其余维度保留占位
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
              <DimensionPane rows={dimensions[t.key]} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function DimensionPane({ rows }: { rows: readonly ErrorDimensionRow[] }) {
  const pieData = useMemo(
    () =>
      rows.map((r) => ({ type: r.value || "unknown", value: r.count })),
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
            name: "事件数",
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
              <TableHead className="text-right">事件数</TableHead>
              <TableHead className="text-right">占比</TableHead>
              <TableHead className="text-right">影响会话</TableHead>
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
                  {r.count.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.sharePercent.toFixed(2)}%
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {r.impactedSessions.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
