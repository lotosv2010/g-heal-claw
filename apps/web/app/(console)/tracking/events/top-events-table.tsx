import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { TrackTopEventRow } from "@/lib/api/tracking";

/**
 * Top 事件表：按 (event_name, track_type) 聚合，事件数倒序
 *
 * 列：类型 · 事件名 · 事件数 · 去重用户 · 占比
 */
export function TopEventsTable({
  rows,
}: {
  rows: readonly TrackTopEventRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        当前窗口无事件样本
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">类型</TableHead>
          <TableHead>事件名</TableHead>
          <TableHead className="w-24 text-right">事件数</TableHead>
          <TableHead className="w-24 text-right">去重用户</TableHead>
          <TableHead className="w-24 text-right">占比</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, idx) => (
          <TableRow key={`${r.trackType}:${r.eventName}:${idx}`}>
            <TableCell>
              <Badge variant="outline">{r.trackType}</Badge>
            </TableCell>
            <TableCell className="text-foreground max-w-xl truncate font-mono text-xs">
              {r.eventName || "(未命名)"}
            </TableCell>
            <TableCell className="text-foreground text-right tabular-nums">
              {r.count.toLocaleString()}
            </TableCell>
            <TableCell className="text-foreground text-right tabular-nums">
              {r.uniqueUsers.toLocaleString()}
            </TableCell>
            <TableCell className="text-muted-foreground text-right tabular-nums">
              {r.sharePercent.toFixed(2)}%
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
