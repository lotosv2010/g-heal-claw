import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TRACK_BUCKET_LABEL,
  TRACK_BUCKET_ORDER,
  TRACK_BUCKET_TONE,
  type TrackTypeBucket,
  type TrackTypeBucketRow,
} from "@/lib/api/tracking";
import { cn } from "@/lib/utils";

/**
 * 事件类型分布（4 桶固定占位：click/expose/submit/code）
 */
export function TypeBuckets({
  buckets,
}: {
  buckets: readonly TrackTypeBucketRow[];
}) {
  const map = new Map<TrackTypeBucket, TrackTypeBucketRow>(
    buckets.map((b) => [b.bucket, b]),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>事件类型分布</CardTitle>
        <div className="text-muted-foreground text-xs">
          click：显式 data-track 点击 · expose：[data-track-expose] 曝光（500ms 停留）·
          submit：表单提交 · code：GHealClaw.track 主动埋点
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {TRACK_BUCKET_ORDER.map((bucket) => {
            const row = map.get(bucket);
            const count = row?.count ?? 0;
            const ratio = row?.ratio ?? 0;
            return (
              <div key={bucket} className="rounded-md border p-3">
                <div
                  className={cn(
                    "text-[11px] font-medium",
                    TRACK_BUCKET_TONE[bucket],
                  )}
                >
                  {TRACK_BUCKET_LABEL[bucket]}
                </div>
                <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                  {count.toLocaleString()}
                </div>
                <div className="text-muted-foreground text-[11px]">
                  {(ratio * 100).toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
