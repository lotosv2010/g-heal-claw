import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LOG_LEVEL_LABEL,
  LOG_LEVEL_ORDER,
  LOG_LEVEL_TONE,
  type LogLevel,
  type LogLevelBucket,
} from "@/lib/api/logs";
import { cn } from "@/lib/utils";

/**
 * 日志级别分布（info / warn / error 3 级别固定占位）
 */
export function LevelBuckets({
  buckets,
}: {
  buckets: readonly LogLevelBucket[];
}) {
  const map = new Map<LogLevel, LogLevelBucket>(
    buckets.map((b) => [b.level, b]),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>日志级别分布</CardTitle>
        <div className="text-muted-foreground text-xs">
          GHealClaw.log(level, ...) 主动上报；info / warn / error 三级别
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {LOG_LEVEL_ORDER.map((level) => {
            const row = map.get(level);
            const count = row?.count ?? 0;
            return (
              <div key={level} className="rounded-md border p-3">
                <div
                  className={cn(
                    "text-[11px] font-medium",
                    LOG_LEVEL_TONE[level],
                  )}
                >
                  {LOG_LEVEL_LABEL[level]}
                </div>
                <div className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
                  {count.toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
