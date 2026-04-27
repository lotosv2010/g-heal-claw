import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LoadStage } from "@/lib/api/performance";

// 页面加载 7 阶段条形图（PRD §2.1）：按最长阶段归一化到 100%
export function PageStagesBars({ stages }: { stages: readonly LoadStage[] }) {
  const max = Math.max(...stages.map((s) => s.ms), 1);
  const total = stages.reduce((sum, s) => sum + s.ms, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>页面加载阶段</CardTitle>
        <div className="text-muted-foreground text-xs">
          共 <span className="text-foreground tabular-nums">{total}</span> ms
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages.map((s) => {
          const pct = Math.max(2, Math.round((s.ms / max) * 100));
          return (
            <div
              key={s.key}
              className="grid grid-cols-[80px_1fr_64px] items-center gap-3 text-sm"
            >
              <span className="text-foreground">{s.label}</span>
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className="bg-brand h-full rounded-full"
                  style={{ width: `${pct}%` }}
                  aria-label={`${s.label} ${s.ms}ms`}
                />
              </div>
              <span className="text-muted-foreground text-right text-xs tabular-nums">
                {s.ms} ms
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
