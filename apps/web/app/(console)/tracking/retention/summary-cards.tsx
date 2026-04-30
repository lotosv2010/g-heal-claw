import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RetentionOverview } from "@/lib/api/retention";

/**
 * 留存大盘顶部 4 张汇总卡（ADR-0028）：
 *  - 新用户总数（Σ cohortSize）
 *  - 平均 day 1 留存（跨 cohort 加权）
 *  - 平均 day 7 留存（若 returnDays < 7，则展示最大 day）
 *  - Cohort 数量
 */
export function SummaryCards({ data }: { data: RetentionOverview }) {
  const day1 = data.averageByDay[1] ?? 0;
  // returnDays < 7 时退化为最大 day；数组长度 = returnDays + 1
  const lastIdx = Math.min(7, data.averageByDay.length - 1);
  const dayN = data.averageByDay[lastIdx] ?? 0;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Metric
        title="新用户总数"
        value={data.totalNewUsers.toLocaleString()}
        hint={`跨 ${data.cohorts.length} 个 cohort 累计`}
      />
      <Metric
        title="平均 day 1 留存"
        value={formatPercent(day1)}
        hint="跨 cohort 按 size 加权"
      />
      <Metric
        title={`平均 day ${lastIdx} 留存`}
        value={formatPercent(dayN)}
        hint={
          lastIdx < 7
            ? "returnDays 不足 7 · 展示最大 offset"
            : "长期留存信号"
        }
      />
      <Metric
        title="Cohort 数量"
        value={String(data.cohorts.length)}
        hint={`Cohort 窗口 ${data.cohortDays}d · 观察 ${data.returnDays}d`}
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
