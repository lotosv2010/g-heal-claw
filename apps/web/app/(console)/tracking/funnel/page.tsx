import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getFunnelOverview,
  parseFunnelQuery,
  type FunnelOverviewResult,
} from "@/lib/api/funnel";
import { FunnelChart } from "./funnel-chart";
import { FunnelConfigForm } from "./funnel-config-form";
import { StepsTable } from "./steps-table";
import { SummaryCards } from "./summary-cards";

// 强制动态渲染：URL 驱动的漏斗视图，每次请求都重新拉数
export const dynamic = "force-dynamic";

type Source = FunnelOverviewResult["source"];

/**
 * 转化漏斗大盘（ADR-0027 / tracking/funnel）
 *
 * URL 驱动：`steps` / `windowHours` / `stepWindowMinutes` 全部从 searchParams 读取，
 * 复制链接即可分享。Server Component 负责：
 *  1. 从 URL 解析 + 夹紧到合法区间
 *  2. 调 `/dashboard/v1/tracking/funnel` 取聚合数据
 *  3. 渲染配置表单 + 汇总卡 + 漏斗图 + 步骤明细
 *
 * 数据源：`track_events_raw` 动态 N 步 CTE 聚合（TrackingService.aggregateFunnel）。
 */
export default async function TrackingFunnelPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const query = parseFunnelQuery(params);
  const { source, data } = await getFunnelOverview(query);

  return (
    <div className="space-y-6">
      <PageHeader
        title="转化漏斗"
        description={`N 步严格顺序命中 · 用户级 COALESCE(user_id, session_id) 去重 · 步长 ≤ ${query.stepWindowMinutes}min`}
        actions={<SourceBadge source={source} />}
      />

      <FunnelConfigForm initial={query} />

      <SummaryCards data={data} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>漏斗形态</CardTitle>
            <div className="text-muted-foreground text-xs">
              从首步到末步的用户流失可视化
            </div>
          </CardHeader>
          <CardContent>
            <FunnelChart steps={data.steps} totalEntered={data.totalEntered} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>步骤明细</CardTitle>
            <div className="text-muted-foreground text-xs">
              逐步用户数 + 本步/上一步 + 本步/首步 转化率
            </div>
          </CardHeader>
          <CardContent>
            <StepsTable rows={data.steps} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "live") {
    return <Badge variant="good">数据来自 track_events_raw（动态 CTE 聚合）</Badge>;
  }
  if (source === "empty") {
    return (
      <Badge variant="warn">
        当前窗口首步无命中 · 检查 steps / 窗口 / SDK track() 调用
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">漏斗 API 不可用 · 检查 apps/server</Badge>
  );
}
