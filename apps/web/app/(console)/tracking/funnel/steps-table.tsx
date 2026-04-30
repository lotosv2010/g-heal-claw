import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FunnelStep } from "@/lib/api/funnel";

/**
 * 漏斗步骤明细表（ADR-0027）
 *
 * 列：序号 · 事件名 · 用户数 · 本步/上一步 · 本步/首步
 *  - 比例渲染为百分比（1 位小数）
 *  - Step 1 的"本步/上一步"恒为 100% 或 0%（totalEntered=0）
 */
export function StepsTable({ rows }: { rows: readonly FunnelStep[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">#</TableHead>
          <TableHead>事件名</TableHead>
          <TableHead className="text-right">用户数</TableHead>
          <TableHead className="text-right">本步 / 上一步</TableHead>
          <TableHead className="text-right">本步 / 首步</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.index}>
            <TableCell className="text-muted-foreground tabular-nums">
              {row.index}
            </TableCell>
            <TableCell className="font-medium">{row.eventName}</TableCell>
            <TableCell className="text-right tabular-nums">
              {row.users.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatPercent(row.conversionFromPrev)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatPercent(row.conversionFromFirst)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
