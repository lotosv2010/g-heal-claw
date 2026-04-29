import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  DeltaDirection,
  ResourcesSummary,
  ResourcesSummaryDelta,
} from "@/lib/api/resources";

/**
 * 资源大盘顶部 5 张汇总卡（TM.1.B.5）：
 *  - 资源请求数（含环比）
 *  - 失败请求数（含失败率绝对差环比）
 *  - 慢资源数（count + 占比）
 *  - p75 耗时
 *  - 传输字节数（Transfer）
 */
export function SummaryCards({ summary }: { summary: ResourcesSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      <Metric
        title="资源请求数"
        value={summary.totalRequests.toLocaleString()}
        hint={
          <DeltaPercentHint
            direction={summary.delta.totalRequestsDirection}
            percent={summary.delta.totalRequests}
          />
        }
      />
      <Metric
        title="失败请求"
        value={summary.failedCount.toLocaleString()}
        hint={
          <DeltaRatioHint
            currentRatio={summary.failureRatio}
            delta={summary.delta}
          />
        }
      />
      <Metric
        title="慢资源"
        value={summary.slowCount.toLocaleString()}
        hint={
          <span className="text-muted-foreground text-[11px]">
            占比 {(summary.slowRatio * 100).toFixed(1)}%
          </span>
        }
      />
      <Metric
        title="p75 耗时"
        value={`${Math.round(summary.p75DurationMs).toLocaleString()} ms`}
        hint={
          <span className="text-muted-foreground text-[11px]">
            75% 资源落在此时延以内
          </span>
        }
      />
      <Metric
        title="传输字节"
        value={formatBytes(summary.totalTransferBytes)}
        hint={
          <span className="text-muted-foreground text-[11px]">
            浏览器从网络获取的总字节数（不含磁盘缓存）
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
  const tone = direction === "up" ? "text-red-600" : "text-emerald-600";
  return (
    <span className={cn("text-[11px]", tone)}>
      {arrow} {percent.toFixed(1)}% · 环比上一等长窗口
    </span>
  );
}

function DeltaRatioHint({
  currentRatio,
  delta,
}: {
  currentRatio: number;
  delta: ResourcesSummaryDelta;
}) {
  const current = `失败率 ${(currentRatio * 100).toFixed(1)}%`;
  if (delta.failureRatioDirection === "flat" || delta.failureRatio === 0) {
    return (
      <span className="text-muted-foreground text-[11px]">
        {current} · 环比持平
      </span>
    );
  }
  const arrow = delta.failureRatioDirection === "up" ? "↑" : "↓";
  const tone =
    delta.failureRatioDirection === "up" ? "text-red-600" : "text-emerald-600";
  return (
    <span className="text-muted-foreground text-[11px]">
      {current} ·{" "}
      <span className={tone}>
        {arrow} {(delta.failureRatio * 100).toFixed(2)}pp
      </span>
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[idx]}`;
}
