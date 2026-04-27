import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  getErrorOverview,
  type ErrorOverviewResult,
} from "@/lib/api/errors";

import { SummaryCards } from "./summary-cards";
import { SubTypeDonut } from "./sub-type-donut";
import { TrendChart } from "./trend-chart";
import { TopGroupsTable } from "./top-groups-table";

// 强制动态渲染：每次请求都从 apps/server 拉最新聚合结果，避免 SSG 冻结
export const dynamic = "force-dynamic";

type Source = ErrorOverviewResult["source"];

/**
 * 异常大盘（ADR-0016 §3）
 *
 * 服务端组件 → `/dashboard/v1/errors/overview`（cache: no-store）
 * 三态 Badge：
 *  - live  → 真实数据，表示至少 1 条事件
 *  - empty → 后端可达但窗口内无事件
 *  - error → 后端 5xx / 不可达
 */
export default async function ErrorsPage() {
  const { source, data } = await getErrorOverview();

  return (
    <div>
      <PageHeader
        title="异常监控"
        description="JS 异常、Promise 拒绝、资源加载失败 —— 24h 实时聚合"
        actions={<SourceBadge source={source} />}
      />

      <section className="mb-6">
        <SummaryCards summary={data.summary} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SubTypeDonut items={data.bySubType} />
        {data.trend.length > 0 ? (
          <TrendChart buckets={data.trend} />
        ) : (
          <EmptyPanel
            title="异常趋势 · 过去 24 小时"
            message={emptyMsg(source, "暂无趋势数据")}
          />
        )}
      </section>

      <section>
        {data.topGroups.length > 0 ? (
          <TopGroupsTable rows={data.topGroups} />
        ) : (
          <EmptyPanel
            title="Top 分组"
            message={emptyMsg(source, "暂无异常分组")}
          />
        )}
      </section>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "live") {
    return <Badge variant="good">数据来自 error_events_raw</Badge>;
  }
  if (source === "empty") {
    return (
      <Badge variant="warn">暂无异常 · 请确保 SDK 已接入并触发 demo 路由</Badge>
    );
  }
  return <Badge variant="destructive">大盘 API 不可用 · 检查 apps/server</Badge>;
}

function emptyMsg(source: Source, fallback: string): string {
  if (source === "error") return "后端暂不可用，无法加载";
  return fallback;
}

function EmptyPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="bg-card rounded-lg border p-6">
      <h3 className="text-foreground text-sm font-medium">{title}</h3>
      <p className="text-muted-foreground mt-8 text-center text-sm">{message}</p>
    </div>
  );
}
