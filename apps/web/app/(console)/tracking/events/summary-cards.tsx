import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DeltaDirection, TrackSummary } from "@/lib/api/tracking";

/**
 * 埋点大盘顶部 4 张汇总卡（P0-3）：
 *  - 总事件数（含环比 vs 上一等长窗口）
 *  - 去重用户（user_id ∪ session_id）
 *  - 事件名去重
 *  - 每会话平均事件数
 */
export function SummaryCards({ summary }: { summary: TrackSummary }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Metric
        title="总事件数"
        value={summary.totalEvents.toLocaleString()}
        hint={
          <DeltaHint
            direction={summary.deltaDirection}
            percent={summary.deltaPercent}
          />
        }
      />
      <Metric
        title="去重用户"
        value={summary.uniqueUsers.toLocaleString()}
        hint={
          <span className="text-muted-foreground text-[11px]">
            session 去重：{summary.uniqueSessions.toLocaleString()}
          </span>
        }
      />
      <Metric
        title="事件名数"
        value={summary.uniqueEventNames.toLocaleString()}
        hint={
          <span className="text-muted-foreground text-[11px]">
            当前窗口触达的不同事件名
          </span>
        }
      />
      <Metric
        title="每会话事件数"
        value={summary.eventsPerSession.toFixed(2)}
        hint={
          <span className="text-muted-foreground text-[11px]">
            总事件 / 去重 session
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
  // 埋点与 API 语义不同：事件增长通常为正向
  const tone = direction === "up" ? "text-emerald-600" : "text-amber-600";
  return (
    <span className={cn("text-[11px]", tone)}>
      {arrow} {percent.toFixed(1)}% · 环比上一等长窗口
    </span>
  );
}
