"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type {
  TrackTopEventRow,
  TrackTopPageRow,
} from "@/lib/api/tracking";
import { TopEventsTable } from "./top-events-table";
import { TopPagesTable } from "./top-pages-table";

/**
 * 埋点多视图 Tabs：
 *  1. Top 事件（按事件名倒序）
 *  2. Top 页面（按 page_path 聚合）
 */
interface Props {
  readonly topEvents: readonly TrackTopEventRow[];
  readonly topPages: readonly TrackTopPageRow[];
}

type TabKey = "events" | "pages";

interface TabDef {
  readonly key: TabKey;
  readonly label: string;
  readonly hint: string;
}

const TABS: readonly TabDef[] = [
  {
    key: "events",
    label: "事件 TOP",
    hint: "按 (event_name, track_type) 聚合，事件数倒序；code 类型对应 GHealClaw.track 主动埋点",
  },
  {
    key: "pages",
    label: "页面 TOP",
    hint: "按 page_path 聚合；定位高埋点密度的页面",
  },
];

export function TrackingTabs({ topEvents, topPages }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>埋点视图</CardTitle>
        <div className="text-muted-foreground text-xs">
          多维度 TOP 排行切换 · 当前窗口与上方趋势图一致
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="events">
          <TabsList className="mb-4 flex w-full flex-wrap justify-start">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="events">
            <TabHint text={hintOf("events")} />
            <TopEventsTable rows={topEvents} />
          </TabsContent>
          <TabsContent value="pages">
            <TabHint text={hintOf("pages")} />
            <TopPagesTable rows={topPages} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function TabHint({ text }: { text: string }) {
  return <p className="text-muted-foreground mb-3 text-xs">{text}</p>;
}

function hintOf(key: TabKey): string {
  return TABS.find((t) => t.key === key)?.hint ?? "";
}
