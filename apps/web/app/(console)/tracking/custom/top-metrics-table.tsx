import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CustomMetricTop } from "@/lib/api/custom";

/**
 * Top 指标表：按 name 分组，p75 倒序
 *
 * 表头：指标名 · 样本数 · p50 · p75 · p95 · 均耗
 */
export function TopMetricsTable({
  rows,
}: {
  rows: readonly CustomMetricTop[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 指标（按 p75 倒序）</CardTitle>
        <div className="text-muted-foreground text-xs">
          按 name 分组；每组 p50 / p75 / p95 / 均耗；默认 TOP 10
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            当前窗口无 custom_metric 样本
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>指标名</TableHead>
                <TableHead className="w-24 text-right">样本数</TableHead>
                <TableHead className="w-24 text-right">p50 (ms)</TableHead>
                <TableHead className="w-24 text-right">p75 (ms)</TableHead>
                <TableHead className="w-24 text-right">p95 (ms)</TableHead>
                <TableHead className="w-24 text-right">均耗 (ms)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={`${r.name}:${idx}`}>
                  <TableCell className="text-foreground font-mono text-xs">
                    {r.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Math.round(r.p50DurationMs).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {Math.round(r.p75DurationMs).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Math.round(r.p95DurationMs).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {Math.round(r.avgDurationMs).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
