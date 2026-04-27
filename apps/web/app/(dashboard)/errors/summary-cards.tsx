import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ErrorSummary } from "@/lib/api/errors";

/**
 * 异常总览卡片：总事件数 / 影响会话数 / 环比
 *
 * - 环比文案：up=红色（坏）/ down=绿色（好）/ flat=灰色
 * - 与 /performance 同构，但 up 的正负意义反转（异常增加为坏）
 */
export function SummaryCards({ summary }: { summary: ErrorSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>总事件数</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-foreground text-2xl font-semibold tabular-nums">
            {summary.totalEvents.toLocaleString()}
          </div>
          <div className="text-muted-foreground mt-2 text-xs">窗口内累计</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>影响会话数</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-foreground text-2xl font-semibold tabular-nums">
            {summary.impactedSessions.toLocaleString()}
          </div>
          <div className="text-muted-foreground mt-2 text-xs">
            COUNT(DISTINCT session_id)
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>环比</CardTitle>
            <DeltaBadge summary={summary} />
          </div>
        </CardHeader>
        <CardContent>
          <DeltaText summary={summary} />
          <div className="text-muted-foreground mt-2 text-xs">
            当前窗口 vs 前一窗口
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DeltaBadge({ summary }: { summary: ErrorSummary }) {
  if (summary.deltaDirection === "flat") {
    return <Badge variant="outline">持平</Badge>;
  }
  // 异常增加是 destructive，减少是 good
  const variant = summary.deltaDirection === "up" ? "destructive" : "good";
  const label = summary.deltaDirection === "up" ? "恶化" : "改善";
  return <Badge variant={variant}>{label}</Badge>;
}

function DeltaText({ summary }: { summary: ErrorSummary }) {
  if (summary.deltaDirection === "flat") {
    return (
      <div className="text-muted-foreground text-2xl font-semibold tabular-nums">
        — 持平
      </div>
    );
  }
  const isUp = summary.deltaDirection === "up";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 text-2xl font-semibold tabular-nums",
        isUp ? "text-red-600" : "text-emerald-600",
      )}
    >
      <span aria-hidden>{isUp ? "▲" : "▼"}</span>
      <span>{summary.deltaPercent.toFixed(1)}%</span>
    </div>
  );
}
