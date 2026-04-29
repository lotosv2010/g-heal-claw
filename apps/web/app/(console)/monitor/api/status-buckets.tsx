import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  STATUS_BUCKET_LABEL,
  STATUS_BUCKET_ORDER,
  STATUS_BUCKET_TONE,
  type ApiStatusBucketRatio,
  type StatusBucket,
} from "@/lib/api/api";
import { cn } from "@/lib/utils";

/**
 * 状态码分布（5 桶固定占位：2xx/3xx/4xx/5xx/0）
 */
export function StatusBuckets({
  buckets,
}: {
  buckets: readonly ApiStatusBucketRatio[];
}) {
  const map = new Map<StatusBucket, ApiStatusBucketRatio>(
    buckets.map((b) => [b.bucket, b]),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>状态码分布</CardTitle>
        <div className="text-muted-foreground text-xs">
          按 HTTP 状态码分桶；0 表示网络层失败（DNS / 超时 / CORS 等）
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {STATUS_BUCKET_ORDER.map((bucket) => {
            const row = map.get(bucket);
            const count = row?.count ?? 0;
            const ratio = row?.ratio ?? 0;
            return (
              <div
                key={bucket}
                className="rounded-md border p-3"
              >
                <div
                  className={cn(
                    "text-[11px] font-medium",
                    STATUS_BUCKET_TONE[bucket],
                  )}
                >
                  {STATUS_BUCKET_LABEL[bucket]}
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
