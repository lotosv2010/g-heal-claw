import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getRetentionOverview,
  parseRetentionQuery,
  type RetentionOverviewResult,
} from "@/lib/api/retention";
import { RetentionChart } from "./retention-chart";
import { RetentionConfigForm } from "./retention-config-form";
import { RetentionHeatmap } from "./retention-heatmap";
import { SummaryCards } from "./summary-cards";

// 强制动态渲染：URL 驱动的留存视图，每次请求都重新拉数
export const dynamic = "force-dynamic";

type Source = RetentionOverviewResult["source"];

/**
 * 用户留存大盘（ADR-0028 / tracking/retention）
 *
 * URL 驱动：`cohortDays` / `returnDays` / `identity` / `since` / `until`
 * 全部从 searchParams 读取，复制链接即可分享当前视图。
 *
 * Server Component 负责：
 *  1. 从 URL 解析 + 夹紧到合法区间（非法值静默回退默认，不 500）
 *  2. 调 `/dashboard/v1/tracking/retention` 取 cohort × day_offset 聚合数据
 *  3. 渲染配置表单 + 汇总卡 + 热力图（按 cohort × day）+ 平均留存曲线
 *
 * 数据源：`page_view_raw` 经 VisitsService.aggregateRetention 单次 CTE。
 */
export default async function TrackingRetentionPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const query = parseRetentionQuery(params);
  const { source, data } = await getRetentionOverview(query);

  return (
    <div className="space-y-6">
      <PageHeader
        title="用户留存"
        description={`cohort × day_offset 矩阵 · 身份维度 ${
          query.identity === "user" ? "user（COALESCE user_id, session_id）" : "session"
        } · 最近 ${query.cohortDays} 天 cohort · 观察 ${query.returnDays} 天`}
        actions={<SourceBadge source={source} />}
      />

      <RetentionConfigForm initial={query} />

      <SummaryCards data={data} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <CardTitle>留存矩阵</CardTitle>
            <div className="text-muted-foreground text-xs">
              行：cohort 日期（ASC） · 列：day offset · 色阶越深留存越高
            </div>
          </CardHeader>
          <CardContent>
            <RetentionHeatmap
              cohorts={data.cohorts}
              returnDays={data.returnDays}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>平均留存曲线</CardTitle>
            <div className="text-muted-foreground text-xs">
              跨 cohort 按 cohortSize 加权的 day 0 ~ day N 留存率
            </div>
          </CardHeader>
          <CardContent>
            <RetentionChart averageByDay={data.averageByDay} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "live") {
    return (
      <Badge variant="good">
        数据来自 page_view_raw（cohort × day_offset 单次 CTE）
      </Badge>
    );
  }
  if (source === "empty") {
    return (
      <Badge variant="warn">
        当前窗口无新用户 cohort · 检查时间范围或 SDK page_view 上报
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">留存 API 不可用 · 检查 apps/server</Badge>
  );
}
