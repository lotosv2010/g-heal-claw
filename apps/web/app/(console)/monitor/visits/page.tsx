import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  getVisitsOverview,
  type VisitsOverviewResult,
} from "@/lib/api/visits";
import { resolveWindowHours } from "@/lib/time-range";
import { DimensionTabs } from "./dimension-tabs";
import { SummaryCards } from "./summary-cards";
import { TrendChart } from "./trend-chart";
import { TopPages } from "./top-pages";
import { TopReferrers } from "./top-referrers";

// 强制动态渲染：每次请求都从 apps/server 拉最新聚合结果
export const dynamic = "force-dynamic";

type Source = VisitsOverviewResult["source"];

/**
 * 页面访问监控页面（ADR-0020 Tier 2.A）
 *
 * 自上而下：
 *  1. 4 张汇总卡：PV / UV / SPA 切换占比 / 刷新占比 + 环比
 *  2. 访问趋势图（按小时 PV / UV）
 *  3. 访问页面 TOP（按 path 聚合 PV 倒序）
 *  4. 引荐来源 TOP（按 referrer_host 聚合 PV 倒序）
 *
 * 数据源：`page_view_raw` 由 pageViewPlugin 上报；鉴权与多项目隔离留给 T1.1.7。
 */
export default async function VisitsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const windowHours = await resolveWindowHours(searchParams);
  const { source, data } = await getVisitsOverview({ windowHours });

  return (
    <div>
      <PageHeader
        title="页面访问"
        description="PV / UV / SPA 切换占比 / 刷新占比 + 访问趋势 + TopPages + TopReferrers 实时聚合"
        actions={<SourceBadge source={source} />}
      />

      <section className="mb-6">
        <SummaryCards summary={data.summary} />
      </section>

      <section className="mb-6">
        <TrendChart buckets={data.trend} />
      </section>

      <section className="mb-6">
        <TopPages rows={data.topPages} />
      </section>

      <section className="mb-6">
        <TopReferrers rows={data.topReferrers} />
      </section>

      <section>
        <DimensionTabs dimensions={data.dimensions} />
      </section>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "live") {
    return <Badge variant="good">数据来自 page_view_raw</Badge>;
  }
  if (source === "empty") {
    return (
      <Badge variant="warn">
        暂无访问样本 · 请确保 SDK pageViewPlugin 已启用
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">大盘 API 不可用 · 检查 apps/server</Badge>
  );
}
