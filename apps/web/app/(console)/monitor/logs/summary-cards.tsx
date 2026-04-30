import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  DeltaDirection,
  LogsSummary,
  LogsSummaryDelta,
} from "@/lib/api/logs";

/**
 * 日志大盘顶部 4 张汇总卡（TM.1.C.5）：
 *  - 日志总数（含环比 %）
 *  - Info 数
 *  - Warn 数
 *  - Error 数 · 错误率（含绝对差 pp）
 */
export function SummaryCards({ summary }: { summary: LogsSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Metric
        title="日志总数"
        value={summary.totalLogs.toLocaleString()}
        hint={
          <DeltaPercentHint
            direction={summary.delta.totalLogsDirection}
            percent={summary.delta.totalLogs}
          />
        }
      />
      <Metric
        title="Info"
        value={summary.infoCount.toLocaleString()}
        hint={
          <span className="text-muted-foreground text-[11px]">
            占比 {ratio(summary.infoCount, summary.totalLogs)}%
          </span>
        }
      />
      <Metric
        title="Warn"
        value={summary.warnCount.toLocaleString()}
        hint={
          <span className="text-muted-foreground text-[11px]">
            占比 {ratio(summary.warnCount, summary.totalLogs)}%
          </span>
        }
      />
      <Metric
        title="Error"
        value={summary.errorCount.toLocaleString()}
        hint={
          <DeltaErrorRatioHint
            currentRatio={summary.errorRatio}
            delta={summary.delta}
          />
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

function DeltaErrorRatioHint({
  currentRatio,
  delta,
}: {
  currentRatio: number;
  delta: LogsSummaryDelta;
}) {
  const current = `错误率 ${(currentRatio * 100).toFixed(1)}%`;
  if (delta.errorRatioDirection === "flat" || delta.errorRatio === 0) {
    return (
      <span className="text-muted-foreground text-[11px]">
        {current} · 环比持平
      </span>
    );
  }
  const arrow = delta.errorRatioDirection === "up" ? "↑" : "↓";
  const tone =
    delta.errorRatioDirection === "up" ? "text-red-600" : "text-emerald-600";
  return (
    <span className="text-muted-foreground text-[11px]">
      {current} ·{" "}
      <span className={tone}>
        {arrow} {(delta.errorRatio * 100).toFixed(2)}pp
      </span>
    </span>
  );
}

function ratio(n: number, total: number): string {
  if (total <= 0) return "0.0";
  return ((n / total) * 100).toFixed(1);
}
