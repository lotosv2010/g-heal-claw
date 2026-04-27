import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VitalMetric } from "@/lib/api/performance";

function formatValue(m: VitalMetric): string {
  if (m.unit === "ms") {
    // LCP/FCP/INP/TTFB 展示：>= 1000ms 折算为 s，保留 2 位；< 1000ms 直接 ms
    return m.value >= 1000 ? `${(m.value / 1000).toFixed(2)} s` : `${m.value} ms`;
  }
  // CLS：无单位，保留 2 位
  return m.value.toFixed(2);
}

const TONE_LABEL: Record<VitalMetric["tone"], string> = {
  good: "良好",
  warn: "需改进",
  destructive: "差",
};

function DeltaArrow({ m }: { m: VitalMetric }) {
  if (m.deltaDirection === "flat") {
    return <span className="text-muted-foreground">— 持平</span>;
  }
  // 对 LCP/ms 类指标 down 是好事，对 CLS 也是；UI 统一按 tone 显示文字色
  const isPositiveOutcome =
    m.deltaDirection === "down" ? true : m.deltaDirection === "up" ? false : true;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5",
        isPositiveOutcome ? "text-emerald-600" : "text-red-600",
      )}
    >
      <span aria-hidden>{m.deltaDirection === "up" ? "▲" : "▼"}</span>
      <span>{Math.abs(m.deltaPercent).toFixed(1)}%</span>
    </span>
  );
}

export function VitalsCards({ metrics }: { metrics: readonly VitalMetric[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {metrics.map((m) => (
        <Card key={m.key}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{m.key}</CardTitle>
              <Badge variant={m.tone}>{TONE_LABEL[m.tone]}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-foreground text-2xl font-semibold tabular-nums">
              {formatValue(m)}
            </div>
            <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
              <DeltaArrow m={m} />
              <span className="tabular-nums">
                {m.sampleCount.toLocaleString()} 样本
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
