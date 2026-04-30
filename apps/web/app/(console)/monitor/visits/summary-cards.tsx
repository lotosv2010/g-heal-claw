import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DeltaDirection, VisitsSummary } from "@/lib/api/visits";

/**
 * Visits 大盘顶部 4 张汇总卡（TM.2.A.6）：
 *  - PV（含环比 vs 上一等长窗口）
 *  - UV（按 session_id 去重）
 *  - SPA 切换占比（spaNavCount / pv）
 *  - 刷新占比（reloadCount / pv）
 */
export function SummaryCards({ summary }: { summary: VisitsSummary }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Metric
        title="PV"
        value={summary.pv.toLocaleString()}
        hint={
          <DeltaHint
            direction={summary.deltaDirection}
            percent={summary.deltaPercent}
          />
        }
      />
      <Metric
        title="UV"
        value={summary.uv.toLocaleString()}
        hint={
          <span className="text-muted-foreground text-[11px]">
            按 session_id 去重
          </span>
        }
      />
      <Metric
        title="SPA 切换占比"
        value={`${(summary.spaNavRatio * 100).toFixed(1)}%`}
        hint={
          <span className="text-muted-foreground text-[11px]">
            SPA 切换 {summary.spaNavCount.toLocaleString()} 次
          </span>
        }
      />
      <Metric
        title="刷新占比"
        value={`${(summary.reloadRatio * 100).toFixed(1)}%`}
        hint={
          <span className="text-muted-foreground text-[11px]">
            硬刷新 {summary.reloadCount.toLocaleString()} 次
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
  // PV 上升视为正向，不同于 API 错误率语义，使用绿色
  const tone =
    direction === "up" ? "text-emerald-600" : "text-red-600";
  return (
    <span className={cn("text-[11px]", tone)}>
      {arrow} {percent.toFixed(1)}% · 环比上一等长窗口
    </span>
  );
}
