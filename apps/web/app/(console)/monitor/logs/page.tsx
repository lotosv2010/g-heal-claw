import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { getLogsOverview, type LogsOverviewResult } from "@/lib/api/logs";
import { resolveWindowHours } from "@/lib/time-range";
import { SummaryCards } from "./summary-cards";
import { LevelBuckets } from "./level-buckets";
import { TrendChart } from "./trend-chart";
import { TopMessagesTable } from "./top-messages-table";

// 强制动态渲染：每次请求都从 apps/server 拉最新聚合结果
export const dynamic = "force-dynamic";

type Source = LogsOverviewResult["source"];

/**
 * 自定义日志大盘（TM.1.C.5 / ADR-0023 §4）
 *
 * 自上而下：
 *  1. 4 张汇总卡：日志总数 / Info / Warn / Error（含错误率环比 pp）
 *  2. 3 级别分桶（info / warn / error 固定占位）
 *  3. 日志趋势图（三折线，图例可切换）
 *  4. Top 消息表（按 level + messageHead）
 *
 * 数据源：custom_logs_raw（customPlugin 主动 log）；与 /monitor/errors 被动捕获互补。
 */
export default async function LogsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const windowHours = await resolveWindowHours(searchParams);
  const { source, data } = await getLogsOverview({ windowHours });

  return (
    <div>
      <PageHeader
        title="自定义日志"
        description="GHealClaw.log(level, message, data) 主动上报的分级日志；info / warn / error 三级别聚合"
        actions={<SourceBadge source={source} />}
      />

      <section className="mb-6">
        <SummaryCards summary={data.summary} />
      </section>

      <section className="mb-6">
        <LevelBuckets buckets={data.levelBuckets} />
      </section>

      <section className="mb-6">
        <TrendChart buckets={data.trend} />
      </section>

      <section>
        <TopMessagesTable rows={data.topMessages} />
      </section>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "live") {
    return <Badge variant="good">数据来自 custom_logs_raw</Badge>;
  }
  if (source === "empty") {
    return (
      <Badge variant="warn">
        暂无日志 · 请调用 GHealClaw.log(&apos;info&apos;, ...)
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">大盘 API 不可用 · 检查 apps/server</Badge>
  );
}
