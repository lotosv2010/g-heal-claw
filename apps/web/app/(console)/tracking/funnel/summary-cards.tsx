import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FunnelOverview } from "@/lib/api/funnel";

/**
 * 漏斗大盘顶部 4 张汇总卡（ADR-0027）：
 *  - 总进入用户（step 1）
 *  - 总转化率（末步 / 首步）
 *  - 窗口（小时）
 *  - 步长（分钟）
 */
export function SummaryCards({ data }: { data: FunnelOverview }) {
  const lastStep = data.steps.at(-1);
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Metric
        title="总进入用户"
        value={data.totalEntered.toLocaleString()}
        hint={`首步：${data.steps[0]?.eventName ?? "—"}`}
      />
      <Metric
        title="总转化率"
        value={formatPercent(data.overallConversion)}
        hint={
          lastStep
            ? `末步 ${lastStep.eventName}：${lastStep.users.toLocaleString()} 人`
            : "—"
        }
      />
      <Metric
        title="聚合窗口"
        value={`${data.windowHours} h`}
        hint="近 N 小时内首步命中即纳入"
      />
      <Metric
        title="步长上限"
        value={`${data.stepWindowMinutes} min`}
        hint="相邻步骤之间的最长等待间隔"
      />
    </div>
  );
}

function Metric({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-muted-foreground text-xs font-medium">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="text-foreground text-2xl font-semibold tabular-nums">
          {value}
        </div>
        {hint ? (
          <div className="text-muted-foreground mt-1 text-[11px]">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}
