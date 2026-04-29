import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ApiSummary, DeltaDirection } from "@/lib/api/api";

/**
 * API 大盘顶部 4 张汇总卡（TM.1.A.5）：
 *  - 请求数（含环比 vs 上一等长窗口）
 *  - 慢请求（count + 占比）
 *  - 失败数（count + 占比）
 *  - p75 耗时
 */
export function SummaryCards({ summary }: { summary: ApiSummary }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Metric
        title="请求数"
        value={summary.totalRequests.toLocaleString()}
        hint={
          <DeltaHint
            direction={summary.deltaDirection}
            percent={summary.deltaPercent}
          />
        }
      />
      <Metric
        title="慢请求"
        value={summary.slowCount.toLocaleString()}
        hint={
          <span className="text-muted-foreground text-[11px]">
            占比 {(summary.slowRatio * 100).toFixed(1)}%
          </span>
        }
      />
      <Metric
        title="失败请求"
        value={summary.failedCount.toLocaleString()}
        hint={
          <span className="text-muted-foreground text-[11px]">
            失败率 {(summary.failedRatio * 100).toFixed(1)}%
          </span>
        }
      />
      <Metric
        title="p75 耗时"
        value={`${Math.round(summary.p75DurationMs).toLocaleString()} ms`}
        hint={
          <span className="text-muted-foreground text-[11px]">
            75% 请求落在此时延以内
          </span>
        }
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
  hint?: React.ReactNode;
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
        {hint ? <div className="mt-1">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function DeltaHint({
  direction,
  percent,
}: {
  direction: DeltaDirection;
  percent: number;
}) {
  if (direction === "flat" || percent === 0) {
    return (
      <span className="text-muted-foreground text-[11px]">
        环比持平（与上一等长窗口对比）
      </span>
    );
  }
  const arrow = direction === "up" ? "↑" : "↓";
  const tone =
    direction === "up" ? "text-red-600" : "text-emerald-600";
  return (
    <span className={cn("text-[11px]", tone)}>
      {arrow} {percent.toFixed(1)}% · 环比上一等长窗口
    </span>
  );
}
