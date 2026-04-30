import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CustomTopPage } from "@/lib/api/custom";

/**
 * Top 页面表：按 page_path 分组统计 custom_event 次数，倒序
 */
export function TopPagesTable({
  rows,
}: {
  rows: readonly CustomTopPage[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 页面（按自定义事件数）</CardTitle>
        <div className="text-muted-foreground text-xs">
          按 page_path 聚合 custom_event 次数；默认 TOP 10
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            当前窗口无自定义事件页面数据
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>页面路径</TableHead>
                <TableHead className="w-32 text-right">事件数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={`${r.pagePath}:${idx}`}>
                  <TableCell className="text-foreground font-mono text-xs truncate max-w-xl">
                    {r.pagePath}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.count.toLocaleString()}
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
