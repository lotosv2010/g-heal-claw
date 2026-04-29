import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResourcesFailingHostRow } from "@/lib/api/resources";

/**
 * Top 失败 host 表：按 host 分组，failureRatio 倒序
 *
 * 表头：Host · 总样本 · 失败数 · 失败率
 */
export function FailingHostsTable({
  rows,
}: {
  rows: readonly ResourcesFailingHostRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 失败 Host</CardTitle>
        <div className="text-muted-foreground text-xs">
          按 host 分组；failureRatio 倒序；默认 TOP 10
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            当前窗口没有失败的 host
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Host</TableHead>
                <TableHead className="w-28 text-right">总样本</TableHead>
                <TableHead className="w-28 text-right">失败数</TableHead>
                <TableHead className="w-28 text-right">失败率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={`${r.host}:${idx}`}>
                  <TableCell className="text-foreground truncate font-mono text-xs">
                    {r.host || "—"}
                  </TableCell>
                  <TableCell className="text-foreground text-right tabular-nums">
                    {r.totalRequests.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-600">
                    {r.failedCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-600">
                    {(r.failureRatio * 100).toFixed(1)}%
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
