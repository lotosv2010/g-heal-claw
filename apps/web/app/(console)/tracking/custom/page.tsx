import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  getCustomOverview,
  type CustomOverviewResult,
} from "@/lib/api/custom";
import { SummaryCards } from "./summary-cards";
import { TrendChart } from "./trend-chart";
import { TopEventsTable } from "./top-events-table";
import { TopMetricsTable } from "./top-metrics-table";
import { TopPagesTable } from "./top-pages-table";

// 强制动态渲染：每次请求都从 apps/server 拉最新聚合结果
export const dynamic = "force-dynamic";

type Source = CustomOverviewResult["source"];

/**
 * 自定义上报大盘（TM.1.C.5 / ADR-0023 §4）
 *
 * 自上而下：
 *  1. 5 张汇总卡：事件数 / 事件名基数 / 指标样本数 / p75-p95 / 平均每会话事件数
 *  2. 双轨趋势图（事件数 / 指标样本 / 指标均耗 切换）
 *  3. Top 事件表
 *  4. Top 指标表
 *  5. Top 页面表
 *
 * 数据源：custom_events_raw / custom_metrics_raw（customPlugin 主动 track / time）
 */
export default async function CustomTrackingPage() {
  const { source, data } = await getCustomOverview();

  return (
    <div>
      <PageHeader
        title="自定义上报"
        description="customPlugin 主动 track / time 的事件与耗时指标实时聚合；与 trackPlugin（被动 DOM）互补"
        actions={<SourceBadge source={source} />}
      />

      <section className="mb-6">
        <SummaryCards summary={data.summary} />
      </section>

      <section className="mb-6">
        <TrendChart events={data.eventsTrend} metrics={data.metricsTrend} />
      </section>

      <section className="mb-6">
        <TopEventsTable rows={data.eventsTopN} />
      </section>

      <section className="mb-6">
        <TopMetricsTable rows={data.metricsTopN} />
      </section>

      <section>
        <TopPagesTable rows={data.topPages} />
      </section>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "live") {
    return (
      <Badge variant="good">
        数据来自 custom_events_raw / custom_metrics_raw
      </Badge>
    );
  }
  if (source === "empty") {
    return (
      <Badge variant="warn">
        暂无自定义上报 · 请调用 GHealClaw.track / time
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">大盘 API 不可用 · 检查 apps/server</Badge>
  );
}
