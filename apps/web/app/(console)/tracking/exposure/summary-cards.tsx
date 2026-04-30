import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DeltaDirection, ExposureSummary } from "@/lib/api/exposure";

/**
 * 曝光大盘顶部 4 张汇总卡（ADR-0024）：
 *  - 总曝光量（含环比 vs 上一等长窗口）
 *  - 去重元素（selector ∪ event_name）
 *  - 去重页面（page_path）
 *  - 每用户平均曝光数
 */
export function SummaryCards({ summary }: { summary: ExposureSummary }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Metric
        title="总曝光量"
        value={summary.totalExposures.toLocaleString()}
        hint={
          <DeltaHint
            direction={summary.deltaDirection}
            percent={summary.deltaPercent}
          />
        }
      />
      <Metric
        title="去重元素"
        value={summary.uniqueSelectors.toLocaleString()}
        hint={
          <span className="text-muted-foreground text-[11px]">
            不同 selector 数 · 观察曝光覆盖面
          </span>
        }
      />
      <Metric
        title="去重页面"
        value={summary.uniquePages.toLocaleString()}
        hint={
          <span className="text-muted-foreground text-[11px]">
            触达曝光的不同 page_path
          </span>
        }
      />
      <Metric
        title="每用户曝光"
        value={summary.exposuresPerUser.toFixed(2)}
        hint={
          <span className="text-muted-foreground text-[11px]">
            总曝光 / 去重用户（user_id ∪ session_id）
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
  // 曝光增长一般是正向（更多内容被看到）
  const tone = direction === "up" ? "text-emerald-600" : "text-amber-600";
  return (
    <span className={cn("text-[11px]", tone)}>
      {arrow} {percent.toFixed(1)}% · 环比上一等长窗口
    </span>
  );
}
