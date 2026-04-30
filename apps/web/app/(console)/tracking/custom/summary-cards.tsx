import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  CustomSummary,
  DeltaDirection,
} from "@/lib/api/custom";

/**
 * 自定义上报大盘顶部 5 张汇总卡（TM.1.C.5）：
 *  - 事件数（含环比）
 *  - 事件名基数 · 最热事件名
 *  - 指标样本数（含环比）
 *  - 全局 p75 / p95
 *  - 平均每会话事件数
 */
export function SummaryCards({ summary }: { summary: CustomSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      <Metric
        title="事件数"
        value={summary.totalEvents.toLocaleString()}
        hint={
          <DeltaPercentHint
            direction={summary.delta.totalEventsDirection}
            percent={summary.delta.totalEvents}
          />
        }
      />
      <Metric
        title="事件名基数"
        value={summary.distinctEventNames.toLocaleString()}
        hint={
          <span className="text-muted-foreground text-[11px] truncate block">
            最热：{summary.topEventName ?? "—"}
          </span>
        }
      />
      <Metric
        title="指标样本数"
        value={summary.totalSamples.toLocaleString()}
        hint={
          <DeltaPercentHint
            direction={summary.delta.totalSamplesDirection}
            percent={summary.delta.totalSamples}
          />
        }
      />
      <Metric
        title="p75 / p95 (ms)"
        value={`${Math.round(summary.globalP75DurationMs).toLocaleString()} / ${Math.round(summary.globalP95DurationMs).toLocaleString()}`}
        hint={
          <span className="text-muted-foreground text-[11px]">
            所有 custom_metric 的全局分位数
          </span>
        }
      />
      <Metric
        title="平均每会话事件数"
        value={summary.avgEventsPerSession.toFixed(2)}
        hint={
          <span className="text-muted-foreground text-[11px]">
            totalEvents / distinct session_id
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

function DeltaPercentHint({
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
  const tone = direction === "up" ? "text-emerald-600" : "text-amber-600";
  return (
    <span className={cn("text-[11px]", tone)}>
      {arrow} {percent.toFixed(1)}% · 环比上一等长窗口
    </span>
  );
}
