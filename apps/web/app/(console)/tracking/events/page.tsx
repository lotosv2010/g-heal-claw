import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  getTrackingOverview,
  type TrackingOverviewResult,
} from "@/lib/api/tracking";
import { SummaryCards } from "./summary-cards";
import { TypeBuckets } from "./type-buckets";
import { TrendChart } from "./trend-chart";
import { TrackingTabs } from "./tracking-tabs";

// 强制动态渲染：每次请求都从 apps/server 拉最新聚合结果
export const dynamic = "force-dynamic";

type Source = TrackingOverviewResult["source"];

/**
 * 事件分析大盘页面（P0-3）
 *
 * 自上而下：
 *  1. 4 张汇总卡：事件数 / 去重用户 / 事件名数 / 每会话事件数
 *  2. 事件类型分布（click / expose / submit / code 4 桶）
 *  3. 事件趋势（事件数 / 去重用户 两组切换）
 *  4. Tabs：事件 TOP · 页面 TOP
 *
 * 数据源：`track_events_raw` 由 trackPlugin 上报。
 */
export default async function TrackingEventsPage() {
  const { source, data } = await getTrackingOverview();

  return (
    <div>
      <PageHeader
        title="事件分析"
        description="点击 / 曝光 / 提交 / 代码埋点全量事件实时聚合"
        actions={<SourceBadge source={source} />}
      />

      <section className="mb-6">
        <SummaryCards summary={data.summary} />
      </section>

      <section className="mb-6">
        <TypeBuckets buckets={data.typeBuckets} />
      </section>

      <section className="mb-6">
        <TrendChart buckets={data.trend} />
      </section>

      <section>
        <TrackingTabs topEvents={data.topEvents} topPages={data.topPages} />
      </section>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "live") {
    return <Badge variant="good">数据来自 track_events_raw</Badge>;
  }
  if (source === "empty") {
    return (
      <Badge variant="warn">暂无埋点样本 · 请确保 SDK trackPlugin 已启用</Badge>
    );
  }
  return (
    <Badge variant="destructive">大盘 API 不可用 · 检查 apps/server</Badge>
  );
}
