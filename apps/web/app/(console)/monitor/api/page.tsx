import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  getApiOverview,
  type ApiOverviewResult,
} from "@/lib/api/api";
import { resolveWindowHours } from "@/lib/time-range";
import { SummaryCards } from "./summary-cards";
import { StatusBuckets } from "./status-buckets";
import { TrendChart } from "./trend-chart";
import { ApiTabs } from "./api-tabs";
import { DimensionTabs } from "./dimension-tabs";

// 强制动态渲染：每次请求都从 apps/server 拉最新聚合结果，避免 SSG 冻结
export const dynamic = "force-dynamic";

type Source = ApiOverviewResult["source"];

/**
 * API 请求监控页面（整合版）
 *
 * 自上而下：
 *  1. 4 张汇总卡：请求数 / 慢请求 / 失败数 / p75
 *  2. 状态码分布（2xx/3xx/4xx/5xx/0）
 *  3. API 性能趋势（样本数 / 均耗时 / 成功率 三组切换）
 *  4. Tabs 多视图：慢请求 TOP · 请求 TOP · 访问页面 TOP · 异常状态码 TOP
 *  5. 维度分布：浏览器 / 操作系统 / 平台（已接入）+ 6 占位维度
 *
 * 数据源：`api_events_raw` 由 apiPlugin 上报；鉴权与多项目隔离留给 T1.1.7。
 */
export default async function ApiPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const windowHours = await resolveWindowHours(searchParams);
  const { source, data } = await getApiOverview({ windowHours });

  return (
    <div>
      <PageHeader
        title="API 请求监控"
        description="所有 fetch / XHR 请求的样本量、慢占比、失败率、p75 实时聚合"
        actions={<SourceBadge source={source} />}
      />

      <section className="mb-6">
        <SummaryCards summary={data.summary} />
      </section>

      <section className="mb-6">
        <StatusBuckets buckets={data.statusBuckets} />
      </section>

      <section className="mb-6">
        <TrendChart buckets={data.trend} />
      </section>

      <section className="mb-6">
        <ApiTabs
          topSlow={data.topSlow}
          topRequests={data.topRequests}
          topPages={data.topPages}
          topErrorStatus={data.topErrorStatus}
        />
      </section>

      <section>
        <DimensionTabs dimensions={data.dimensions} />
      </section>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "live") {
    return <Badge variant="good">数据来自 api_events_raw</Badge>;
  }
  if (source === "empty") {
    return (
      <Badge variant="warn">暂无请求样本 · 请确保 SDK apiPlugin 已启用</Badge>
    );
  }
  return <Badge variant="destructive">大盘 API 不可用 · 检查 apps/server</Badge>;
}
