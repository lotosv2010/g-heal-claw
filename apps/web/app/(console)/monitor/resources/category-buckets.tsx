import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RESOURCE_CATEGORY_LABEL,
  RESOURCE_CATEGORY_ORDER,
  RESOURCE_CATEGORY_TONE,
  type ResourceCategory,
  type ResourcesCategoryBucket,
} from "@/lib/api/resources";
import { cn } from "@/lib/utils";

/**
 * 资源分类分布（6 类固定占位）
 */
export function CategoryBuckets({
  buckets,
}: {
  buckets: readonly ResourcesCategoryBucket[];
}) {
  const map = new Map<ResourceCategory, ResourcesCategoryBucket>(
    buckets.map((b) => [b.category, b]),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>资源分类</CardTitle>
        <div className="text-muted-foreground text-xs">
          按 initiatorType 分类，明确排除 fetch / xhr / beacon（由 API 监控覆盖）
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {RESOURCE_CATEGORY_ORDER.map((category) => {
            const row = map.get(category);
            const count = row?.count ?? 0;
            const failed = row?.failedCount ?? 0;
            const slow = row?.slowCount ?? 0;
            const avg = row?.avgDurationMs ?? 0;
            return (
              <div key={category} className="rounded-md border p-3">
                <div
                  className={cn(
                    "text-[11px] font-medium",
                    RESOURCE_CATEGORY_TONE[category],
                  )}
                >
                  {RESOURCE_CATEGORY_LABEL[category]}
                </div>
                <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                  {count.toLocaleString()}
                </div>
                <div className="text-muted-foreground text-[11px]">
                  失败 {failed.toLocaleString()} · 慢 {slow.toLocaleString()}
                </div>
                <div className="text-muted-foreground text-[11px]">
                  均耗 {Math.round(avg).toLocaleString()} ms
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
