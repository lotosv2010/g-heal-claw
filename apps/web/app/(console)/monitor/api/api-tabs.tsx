"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type {
  ApiTopErrorStatusRow,
  ApiTopPageRow,
  ApiTopRequestRow,
  ApiTopSlowRow,
} from "@/lib/api/api";
import { TopSlowTable } from "./top-slow-table";
import { TopRequestsTable } from "./top-requests-table";
import { TopPagesTable } from "./top-pages-table";
import { TopErrorStatusTable } from "./top-error-status-table";

/**
 * API 监控多视图 Tabs（对齐性能 / 异常页面体验）
 *
 * 4 个 Tab：
 *  1. 慢请求 TOP（按 p75 倒序）
 *  2. 请求 TOP（按样本量倒序）
 *  3. 访问页面 TOP（按 page_path 聚合）
 *  4. 异常状态码 TOP（4xx / 5xx / 0）
 */
interface Props {
  readonly topSlow: readonly ApiTopSlowRow[];
  readonly topRequests: readonly ApiTopRequestRow[];
  readonly topPages: readonly ApiTopPageRow[];
  readonly topErrorStatus: readonly ApiTopErrorStatusRow[];
}

type TabKey = "slow" | "requests" | "pages" | "errorStatus";

interface TabDef {
  readonly key: TabKey;
  readonly label: string;
  readonly hint: string;
}

const TABS: readonly TabDef[] = [
  {
    key: "slow",
    label: "慢请求 TOP",
    hint: "按 (method, host, pathTemplate) 聚合，p75 耗时倒序",
  },
  {
    key: "requests",
    label: "请求 TOP",
    hint: "按 (method, host, pathTemplate) 聚合，样本量倒序",
  },
  {
    key: "pages",
    label: "访问页面 TOP",
    hint: "按 page_path 聚合，定位高 API 负载页面",
  },
  {
    key: "errorStatus",
    label: "异常状态码 TOP",
    hint: "仅 4xx / 5xx / 0（网络失败），按次数倒序",
  },
];

export function ApiTabs({
  topSlow,
  topRequests,
  topPages,
  topErrorStatus,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>API 视图</CardTitle>
        <div className="text-muted-foreground text-xs">
          多维度 TOP 排行切换 · 当前窗口与上方趋势图一致
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="slow">
          <TabsList className="mb-4 flex w-full flex-wrap justify-start">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="slow">
            <TabHint text={hintOf("slow")} />
            <TopSlowTable rows={topSlow} />
          </TabsContent>
          <TabsContent value="requests">
            <TabHint text={hintOf("requests")} />
            <TopRequestsTable rows={topRequests} />
          </TabsContent>
          <TabsContent value="pages">
            <TabHint text={hintOf("pages")} />
            <TopPagesTable rows={topPages} />
          </TabsContent>
          <TabsContent value="errorStatus">
            <TabHint text={hintOf("errorStatus")} />
            <TopErrorStatusTable rows={topErrorStatus} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function TabHint({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground mb-3 text-xs">
      {text}
    </p>
  );
}

function hintOf(key: TabKey): string {
  return TABS.find((t) => t.key === key)?.hint ?? "";
}
