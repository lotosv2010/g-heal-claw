import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  getOverviewSummary,
  type OverviewSummaryResult,
} from "@/lib/api/overview";
import { resolveWindowHours } from "@/lib/time-range";
import { HealthHeroCard } from "./health-hero-card";
import { DomainSummaryGrid } from "./domain-summary-grid";

// 强制动态渲染：每次请求都从 apps/server 拉最新 5 域并发聚合
export const dynamic = "force-dynamic";

type Source = OverviewSummaryResult["source"];

/**
 * 数据总览页面（ADR-0029 / TM.3.A.3）
 *
 * 自上而下：
 *  1. HealthHeroCard：全站健康度 0~100 + tone + top 扣分项明细
 *  2. 5 张 DomainSummaryCard（errors / performance / api / resources / visits）等宽排列
 *
 * 数据源：`/dashboard/v1/overview/summary`（Promise.allSettled 并发 5 域 service）
 * 鉴权 / 项目隔离：留给 T1.1.7，当前固定 NEXT_PUBLIC_DEFAULT_PROJECT_ID
 */
export default async function OverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const windowHours = await resolveWindowHours(searchParams);
  const { source, data } = await getOverviewSummary({ windowHours });

  return (
    <div>
      <PageHeader
        title="数据总览"
        description="5 域并发聚合（errors / performance / api / resources / visits）+ 全站健康度"
        actions={<SourceBadge source={source} />}
      />

      <section className="mb-6">
        <HealthHeroCard health={data.health} windowHours={data.windowHours} />
      </section>

      <section>
        <DomainSummaryGrid data={data} />
      </section>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "live") {
    return <Badge variant="good">聚合 5 域 · 24h 窗口</Badge>;
  }
  if (source === "empty") {
    return (
      <Badge variant="warn">
        暂无样本 · 请确保 SDK 已接入并有真实流量
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">大盘 API 不可用 · 检查 apps/server</Badge>
  );
}
