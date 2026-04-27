import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { getPerformanceOverview, type OverviewSource } from "@/lib/api/performance";

// 强制动态渲染：每次请求都从 apps/server 拉最新聚合结果，避免被 SSG 冻结
export const dynamic = "force-dynamic";
import { VitalsCards } from "./vitals-cards";
import { PageWaterfall } from "./page-waterfall";
import { TrendChart } from "./trend-chart";
import { SlowPagesTable } from "./slow-pages-table";

/**
 * 服务端组件（ADR-0015）
 *
 * 每次请求直拉 `/dashboard/v1/performance/overview`（`cache: no-store`）；
 * 三态由 `getPerformanceOverview()` 统一返回 `source`：
 *  - live  → 真实数据
 *  - empty → DB 无该项目样本，渲染空态提示
 *  - error → 后端不可用，Badge 明确提示
 */
export default async function PerformancePage() {
  const { source, data } = await getPerformanceOverview();

  return (
    <div>
      <PageHeader
        title="页面性能"
        description="Core Web Vitals、加载阶段、慢页面 Top 10"
        actions={<SourceBadge source={source} />}
      />

      <section className="mb-6">
        <VitalsCards metrics={data.vitals} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.trend.length > 0 ? (
          <TrendChart buckets={data.trend} />
        ) : (
          <EmptyPanel title="Web Vitals p75 · 过去 24 小时" message={emptyMsg(source, "暂无趋势数据")} />
        )}
        {data.stages.length > 0 ? (
          <PageWaterfall stages={data.stages} />
        ) : (
          <EmptyPanel title="页面加载瀑布图" message={emptyMsg(source, "暂无瀑布图样本")} />
        )}
      </section>

      <section>
        {data.slowPages.length > 0 ? (
          <SlowPagesTable rows={data.slowPages} />
        ) : (
          <EmptyPanel title="慢加载 Top 10 页面" message={emptyMsg(source, "暂无慢页面数据")} />
        )}
      </section>
    </div>
  );
}

function SourceBadge({ source }: { source: OverviewSource }) {
  if (source === "live") {
    return <Badge variant="good">数据来自 perf_events_raw</Badge>;
  }
  if (source === "empty") {
    return (
      <Badge variant="warn">暂无数据 · 请确保 SDK 已接入并访问 demo</Badge>
    );
  }
  return <Badge variant="destructive">大盘 API 不可用 · 检查 apps/server</Badge>;
}

function emptyMsg(source: OverviewSource, fallback: string): string {
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
