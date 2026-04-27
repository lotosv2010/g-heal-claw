import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrendBucket } from "@/lib/api/performance";
import { cn } from "@/lib/utils";

// 24 小时 LCP p75 趋势图：CSS flex 柱状（ECharts 推迟至 T2.1.7）
// 视觉目标：让观测者一眼看出峰谷位置，不追求像素级精确
export function TrendChart({ buckets }: { buckets: readonly TrendBucket[] }) {
  if (buckets.length === 0) return null;
  const values = buckets.map((b) => b.lcpP75);
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  return (
    <Card>
      <CardHeader>
        <CardTitle>LCP p75 · 过去 24 小时</CardTitle>
        <div className="text-muted-foreground flex items-center gap-4 text-xs">
          <span>
            峰值 <span className="text-foreground tabular-nums">{max}</span> ms
          </span>
          <span>
            谷值 <span className="text-foreground tabular-nums">{min}</span> ms
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex h-40 items-end gap-1">
          {buckets.map((b) => {
            const h = Math.max(6, Math.round((b.lcpP75 / max) * 100));
            // 柱体着色：LCP p75 > 2500ms 时使用 warn 色，否则 brand 色
            const tone =
              b.lcpP75 > 2500 ? "bg-warn" : "bg-brand";
            return (
              <div
                key={b.hour}
                className="flex flex-1 flex-col items-center justify-end"
                title={`${new Date(b.hour).toUTCString()} · LCP p75 ${b.lcpP75}ms`}
              >
                <div
                  className={cn("w-full rounded-t", tone)}
                  style={{ height: `${h}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="text-muted-foreground mt-2 flex justify-between text-[10px] tabular-nums">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </CardContent>
    </Card>
  );
}
