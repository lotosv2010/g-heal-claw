import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  getResourcesOverview,
  type ResourcesOverviewResult,
} from "@/lib/api/resources";
import { resolveWindowHours } from "@/lib/time-range";
import { SummaryCards } from "./summary-cards";
import { CategoryBuckets } from "./category-buckets";
import { TrendChart } from "./trend-chart";
import { TopSlowTable } from "./top-slow-table";
import { FailingHostsTable } from "./failing-hosts-table";

// 强制动态渲染：每次请求都从 apps/server 拉最新聚合结果，避免 SSG 冻结
export const dynamic = "force-dynamic";

type Source = ResourcesOverviewResult["source"];

/**
 * 静态资源监控页面（TM.1.B.5 / ADR-0022 §4）
 *
 * 自上而下：
 *  1. 5 张汇总卡：请求数 / 失败数 / 慢资源 / p75 / 传输字节
 *  2. 资源分类分布（script/stylesheet/image/font/media/other 6 类固定占位）
 *  3. 资源趋势图（样本数 3 折线 + 均耗时单折线 切换）
 *  4. Top 慢资源表
 *  5. Top 失败 host 表
 *
 * 数据源：`resource_events_raw` 由 resourcePlugin 上报；fetch / xhr / beacon 由 /monitor/api 负责。
 */
export default async function ResourcesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const windowHours = await resolveWindowHours(searchParams);
  const { source, data } = await getResourcesOverview({ windowHours });

  return (
    <div>
      <PageHeader
        title="静态资源监控"
        description="所有 script / stylesheet / image / font / media 等资源加载的样本量、慢占比、失败率、p75 实时聚合"
        actions={<SourceBadge source={source} />}
      />

      <section className="mb-6">
        <SummaryCards summary={data.summary} />
      </section>

      <section className="mb-6">
        <CategoryBuckets buckets={data.categoryBuckets} />
      </section>

      <section className="mb-6">
        <TrendChart buckets={data.trend} />
      </section>

      <section className="mb-6">
        <TopSlowTable rows={data.topSlow} />
      </section>

      <section>
        <FailingHostsTable rows={data.topFailingHosts} />
      </section>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "live") {
    return <Badge variant="good">数据来自 resource_events_raw</Badge>;
  }
  if (source === "empty") {
    return (
      <Badge variant="warn">
        暂无资源样本 · 请确保 SDK resourcePlugin 已启用
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">大盘 API 不可用 · 检查 apps/server</Badge>
  );
}
