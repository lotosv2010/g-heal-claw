import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HealthDto, HealthTone } from "@/lib/api/overview";

/**
 * HealthHeroCard：全站健康度主卡（ADR-0029 §4）
 *
 * - score=null → "数据不足" 引导
 * - tone 映射 Badge variant
 * - components 排序取扣分最多的 3 项展示
 */
export function HealthHeroCard({
  health,
  windowHours,
}: {
  health: HealthDto;
  windowHours: number;
}) {
  const topDeductions = [...health.components]
    .filter((c) => c.deducted > 0)
    .sort((a, b) => b.deducted - a.deducted)
    .slice(0, 3);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs font-medium">
          全站健康度（过去 {windowHours} 小时）
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-baseline gap-3">
            <span
              className={cn(
                "text-5xl font-semibold tabular-nums",
                scoreColor(health.tone),
              )}
            >
              {health.score ?? "—"}
            </span>
            <span className="text-muted-foreground text-sm">/ 100</span>
            <ToneBadge tone={health.tone} />
          </div>
          <div className="text-muted-foreground min-w-[260px] text-xs">
            {health.score == null
              ? "当前窗口内 5 域均无样本，请先接入 SDK 并产生真实流量。"
              : topDeductions.length === 0
                ? "各分量均在健康阈值内，无扣分项。"
                : `扣分 top ${topDeductions.length}：${topDeductions
                    .map((c) => `${labelOf(c.key)} -${c.deducted.toFixed(1)}`)
                    .join(" · ")}`}
          </div>
        </div>

        {topDeductions.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
            {topDeductions.map((c) => (
              <div
                key={c.key}
                className="bg-muted/40 rounded-md px-3 py-2"
              >
                <div className="text-muted-foreground text-[11px]">
                  {labelOf(c.key)}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-semibold tabular-nums text-red-600">
                    -{c.deducted.toFixed(1)}
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    权重 {c.weight.toFixed(1)} · signal {formatSignal(c.key, c.signal)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ToneBadge({ tone }: { tone: HealthTone }) {
  if (tone === "good") return <Badge variant="good">健康</Badge>;
  if (tone === "warn") return <Badge variant="warn">需关注</Badge>;
  if (tone === "destructive") return <Badge variant="destructive">告警</Badge>;
  return <Badge variant="outline">数据不足</Badge>;
}

function scoreColor(tone: HealthTone): string {
  switch (tone) {
    case "good":
      return "text-emerald-600";
    case "warn":
      return "text-amber-600";
    case "destructive":
      return "text-red-600";
    default:
      return "text-muted-foreground";
  }
}

function labelOf(key: "errors" | "performance" | "api" | "resources"): string {
  switch (key) {
    case "errors":
      return "异常";
    case "performance":
      return "性能 (LCP)";
    case "api":
      return "API 错误率";
    case "resources":
      return "资源失败率";
  }
}

function formatSignal(
  key: "errors" | "performance" | "api" | "resources",
  signal: number,
): string {
  if (key === "performance") return `${Math.round(signal)}ms`;
  // 错误率 / 失败率 / errors 自定义 signal 均为小数
  return `${(signal * 100).toFixed(2)}%`;
}
