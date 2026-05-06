import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  getExposureOverview,
  type ExposureOverviewResult,
} from "@/lib/api/exposure";
import { resolveWindowHours } from "@/lib/time-range";
import { SummaryCards } from "./summary-cards";
import { TrendChart } from "./trend-chart";
import { TopSelectorsTable } from "./top-selectors-table";
import { TopPagesTable } from "./top-pages-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// 强制动态渲染：每次请求都从 apps/server 拉最新曝光聚合结果
export const dynamic = "force-dynamic";

type Source = ExposureOverviewResult["source"];

/**
 * 曝光分析大盘（ADR-0024 / tracking/exposure）
 *
 * 自上而下：
 *  1. 4 张汇总卡：总曝光 / 去重元素 / 去重页面 / 每用户曝光
 *  2. 小时趋势（曝光量 / 去重用户 切换）
 *  3. Top 元素 / Top 页面（两列并排）
 *
 * 数据源：`track_events_raw` 中 `track_type='expose'` 子集，由 trackPlugin 在
 * IntersectionObserver 命中且停留 ≥ exposeDwellMs 后写入。
 */
export default async function TrackingExposurePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const windowHours = await resolveWindowHours(searchParams);
  const { source, data } = await getExposureOverview({ windowHours });

  return (
    <div>
      <PageHeader
        title="曝光分析"
        description="IntersectionObserver 驱动的元素曝光聚合 · 观察用户实际看见的内容"
        actions={<SourceBadge source={source} />}
      />

      <section className="mb-6">
        <SummaryCards summary={data.summary} />
      </section>

      <section className="mb-6">
        <TrendChart buckets={data.trend} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top 元素</CardTitle>
            <div className="text-muted-foreground text-xs">
              按 selector 聚合（回落 event_name）；曝光量倒序
            </div>
          </CardHeader>
          <CardContent>
            <TopSelectorsTable rows={data.topSelectors} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 页面</CardTitle>
            <div className="text-muted-foreground text-xs">
              按 page_path 聚合；定位曝光密度最高的页面
            </div>
          </CardHeader>
          <CardContent>
            <TopPagesTable rows={data.topPages} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "live") {
    return <Badge variant="good">数据来自 track_events_raw (expose)</Badge>;
  }
  if (source === "empty") {
    return (
      <Badge variant="warn">
        暂无曝光样本 · 确认 trackPlugin.captureExpose 开启并标注 [data-track-expose]
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">大盘 API 不可用 · 检查 apps/server</Badge>
  );
}
