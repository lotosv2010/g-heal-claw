import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { getPerformanceOverview, type OverviewSource } from "@/lib/api/performance";

// 强制动态渲染：每次请求都从 apps/server 拉最新聚合结果，避免被 SSG 冻结
export const dynamic = "force-dynamic";
import { CommonMetricsCards } from "./common-metrics-cards";
import { PageWaterfall } from "./page-waterfall";
import { TrendChart } from "./trend-chart";
import { CoreVitalsPanel } from "./core-vitals-panel";
import { FmpPagesTable } from "./fmp-pages-table";
import { DimensionTabs } from "./dimension-tabs";

/**
 * 页面性能（ADR-0015，layout 优化 v2）
 *
 * 从上至下：
 *  1. 常用指标卡：FMP / TTFB / DOM Ready / 页面完全加载 / 采样数量
 *  2. 性能视图：Web Vitals 24h 趋势
 *  3. 页面加载瀑布图
 *  4. Core Web Vitals：LCP/FID/CLS/FCP/TTI/INP 三段式
 *  5. 首屏时间 FMP Top（按页面聚合）
 *  6. 维度分布（浏览器 / OS / 平台 + 占位项）
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

      {/* 1. 常用指标 */}
      <section className="mb-6">
        <CommonMetricsCards
          vitals={data.vitals}
          stages={data.stages}
          longTasks={data.longTasks}
        />
      </section>

      {/* 2. 性能视图（趋势） */}
      <section className="mb-6">
        {data.trend.length > 0 ? (
          <TrendChart buckets={data.trend} />
        ) : (
          <EmptyPanel
            title="Web Vitals p75 · 过去 24 小时"
            message={emptyMsg(source, "暂无趋势数据")}
          />
        )}
      </section>

      {/* 3. 页面加载瀑布图 */}
      <section className="mb-6">
        {data.stages.length > 0 ? (
          <PageWaterfall stages={data.stages} />
        ) : (
          <EmptyPanel
            title="页面加载瀑布图"
            message={emptyMsg(source, "暂无瀑布图样本")}
          />
        )}
      </section>

      {/* 4. Core Web Vitals（三段式） */}
      <section className="mb-6">
        <CoreVitalsPanel metrics={data.vitals} />
      </section>

      {/* 5. 首屏时间（FMP 表） */}
      <section className="mb-6">
        {data.fmpPages.length > 0 ? (
          <FmpPagesTable rows={data.fmpPages} />
        ) : (
          <EmptyPanel
            title="首屏时间（FMP）"
            message={emptyMsg(source, "暂无首屏页面数据")}
          />
        )}
      </section>

      {/* 6. 维度分布（浏览器 / OS / 平台 + 占位项） */}
      <section>
        <DimensionTabs dimensions={data.dimensions} />
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
