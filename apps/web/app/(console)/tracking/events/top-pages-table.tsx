import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TrackTopPageRow } from "@/lib/api/tracking";

/**
 * Top 页面表：按 page_path 聚合，事件数倒序
 *
 * 列：页面路径 · 事件数 · 去重用户
 */
export function TopPagesTable({
  rows,
}: {
  rows: readonly TrackTopPageRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        当前窗口无页面埋点样本
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>页面路径</TableHead>
          <TableHead className="w-28 text-right">事件数</TableHead>
          <TableHead className="w-28 text-right">去重用户</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, idx) => (
          <TableRow key={`${r.pagePath}:${idx}`}>
            <TableCell className="text-foreground max-w-xl truncate font-mono text-xs">
              {r.pagePath || "(未知页面)"}
            </TableCell>
            <TableCell className="text-foreground text-right tabular-nums">
              {r.count.toLocaleString()}
            </TableCell>
            <TableCell className="text-foreground text-right tabular-nums">
              {r.uniqueUsers.toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
