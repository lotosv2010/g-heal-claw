import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ApiTopSlowRow } from "@/lib/api/api";

/**
 * Top 慢请求表：按 (method, host, pathTemplate) 分组，p75 倒序
 *
 * 表头：Method · Host · Path Template · 样本数 · p75(ms) · 失败率
 * 无 Card 包裹，由上层 Tabs 容器负责视觉分组
 */
export function TopSlowTable({
  rows,
}: {
  rows: readonly ApiTopSlowRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        当前窗口无请求样本
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Method</TableHead>
          <TableHead className="w-48">Host</TableHead>
          <TableHead>Path Template</TableHead>
          <TableHead className="w-24 text-right">样本数</TableHead>
          <TableHead className="w-28 text-right">p75 (ms)</TableHead>
          <TableHead className="w-24 text-right">失败率</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, idx) => (
          <TableRow key={`${r.method}:${r.host}:${r.pathTemplate}:${idx}`}>
            <TableCell>
              <Badge variant="outline">{r.method}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground truncate font-mono text-xs">
              {r.host}
            </TableCell>
            <TableCell className="text-foreground max-w-xl truncate font-mono text-xs">
              {r.pathTemplate}
            </TableCell>
            <TableCell className="text-foreground text-right tabular-nums">
              {r.sampleCount.toLocaleString()}
            </TableCell>
            <TableCell className="text-foreground text-right tabular-nums">
              {Math.round(r.p75DurationMs).toLocaleString()}
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
