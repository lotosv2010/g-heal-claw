import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiTopPageRow } from "@/lib/api/api";

/**
 * 访问页面 TOP 表：按 page_path 聚合本页发起的 API 请求数、均耗时与失败率
 *
 * 数据来源：api_events_raw.page_path（SDK 上报）
 * 用途：定位高 API 负载页面，辅助前端性能与异常归因
 */
export function TopPagesTable({
  rows,
}: {
  rows: readonly ApiTopPageRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        当前窗口无页面 API 上报样本
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>页面路径</TableHead>
          <TableHead className="w-24 text-right">请求数</TableHead>
          <TableHead className="w-28 text-right">均耗时 (ms)</TableHead>
          <TableHead className="w-24 text-right">失败数</TableHead>
          <TableHead className="w-24 text-right">失败率</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, idx) => (
          <TableRow key={`${r.pagePath}:${idx}`}>
            <TableCell className="text-muted-foreground tabular-nums">
              {idx + 1}
            </TableCell>
            <TableCell className="text-foreground max-w-xl truncate font-mono text-xs">
              {r.pagePath}
            </TableCell>
            <TableCell className="text-foreground text-right tabular-nums">
              {r.requestCount.toLocaleString()}
            </TableCell>
            <TableCell className="text-foreground text-right tabular-nums">
              {Math.round(r.avgDurationMs).toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <span
                className={
                  r.failedCount > 0
                    ? "text-red-600"
                    : "text-muted-foreground"
                }
              >
                {r.failedCount.toLocaleString()}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <span
                className={
                  r.failureRatio > 0
                    ? "text-red-600"
                    : "text-muted-foreground"
                }
              >
                {(r.failureRatio * 100).toFixed(1)}%
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
