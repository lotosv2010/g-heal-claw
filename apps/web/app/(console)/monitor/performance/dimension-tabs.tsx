"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { DimensionRow, Dimensions } from "@/lib/api/performance";

// @ant-design/plots 只在客户端渲染；首屏不进入 HTML 负载
const Pie = dynamic(() => import("@ant-design/plots").then((m) => m.Pie), {
  ssr: false,
  loading: () => <Skeleton className="h-60 w-full" />,
});

/**
 * 维度分布 Tabs（Phase 1 范围）
 *
 * 已持久化的维度列（perf_events_raw）：
 *  - 浏览器（browser）
 *  - 操作系统（os）
 *  - 平台（device_type：desktop / mobile / tablet / unknown）
 *
 * 尚未持久化的维度（Phase 2 扩展，需 UA-parser / GeoIP / DB 迁移）：
 *  - 机型、浏览器版本、操作系统版本、地域、运营商、网络
 *  展示为占位 Tab（禁用），维持产品信息完整性。
 *
 * 每个 Tab 内：左 1/3 环图 · 右 2/3 表格（#/取值/占比/FMP 均值）
 */

// 维度 Tab 配置
type ActiveKey = "browser" | "os" | "platform";
type PlaceholderKey =
  | "device"
  | "browserVersion"
  | "osVersion"
  | "region"
  | "carrier"
  | "network";

interface TabDef {
  readonly key: ActiveKey | PlaceholderKey;
  readonly label: string;
  readonly active: boolean;
}

const TABS: readonly TabDef[] = [
  { key: "browser", label: "浏览器", active: true },
  { key: "os", label: "操作系统", active: true },
  { key: "platform", label: "平台", active: true },
  { key: "device", label: "机型", active: false },
  { key: "browserVersion", label: "浏览器版本", active: false },
  { key: "osVersion", label: "操作系统版本", active: false },
  { key: "region", label: "地域", active: false },
  { key: "carrier", label: "运营商", active: false },
  { key: "network", label: "网络", active: false },
];

// 环图色板：低饱和但足够区分（与瀑布图配色对齐）
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

export function DimensionTabs({ dimensions }: { dimensions: Dimensions }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>维度分布</CardTitle>
        <div className="text-muted-foreground text-xs">
          按样本数占比展示 · 未采集维度（机型 / 版本 / 地域 / 运营商 / 网络）将在 Phase 2 启用
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="browser">
          <TabsList className="mb-4 flex w-full flex-wrap justify-start">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                disabled={!t.active}
                className="relative"
              >
                {t.label}
                {!t.active ? (
                  <span className="text-muted-foreground ml-1 text-[10px]">
                    · 待采集
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="browser">
            <DimensionPane rows={dimensions.browser} />
          </TabsContent>
          <TabsContent value="os">
            <DimensionPane rows={dimensions.os} />
          </TabsContent>
          <TabsContent value="platform">
            <DimensionPane rows={dimensions.platform} />
          </TabsContent>
          {/* 占位 Tab：理论上 disabled 不会被激活，但为保险起见放占位内容 */}
          {(
            [
              "device",
              "browserVersion",
              "osVersion",
              "region",
              "carrier",
              "network",
            ] as const
          ).map((k) => (
            <TabsContent key={k} value={k}>
              <UpcomingPane />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function DimensionPane({ rows }: { rows: readonly DimensionRow[] }) {
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
      legend: { color: { position: "bottom" as const, layout: { justifyContent: "center" as const } } },
      scale: {
        color: {
          range: PIE_COLORS,
        },
      },
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
        暂无该维度数据
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
              <TableHead className="text-right">占比</TableHead>
              <TableHead className="text-right">FMP 均值</TableHead>
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
                  {r.sharePercent.toFixed(2)}%
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {r.fmpAvgMs > 0 ? `${r.fmpAvgMs.toLocaleString()} ms` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function UpcomingPane() {
  return (
    <p className="text-muted-foreground py-10 text-center text-sm">
      此维度尚未采集 · Phase 2 将接入 UA 解析 / GeoIP / 网络上报
    </p>
  );
}
