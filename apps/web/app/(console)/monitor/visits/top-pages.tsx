import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { VisitsTopPageRow } from "@/lib/api/visits";

/**
 * 访问页面 TOP：按 page_view_raw.path 聚合 PV / UV / 占比
 *
 * 数据来源：page_view_raw（pageViewPlugin 上报）
 * 用途：识别当前窗口高访问路径
 */
export function TopPages({
  rows,
}: {
  rows: readonly VisitsTopPageRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>访问页面 TOP</CardTitle>
        <div className="text-muted-foreground text-xs">
          按 path 聚合 · PV 倒序 · 占比基于窗口总 PV
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            当前窗口无访问样本
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>路径</TableHead>
                <TableHead className="w-24 text-right">PV</TableHead>
                <TableHead className="w-24 text-right">UV</TableHead>
                <TableHead className="w-24 text-right">占比</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={`${r.path}:${idx}`}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="text-foreground max-w-xl truncate font-mono text-xs">
                    {r.path}
                  </TableCell>
                  <TableCell className="text-foreground text-right tabular-nums">
                    {r.pv.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-foreground text-right tabular-nums">
                    {r.uv.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {r.sharePercent.toFixed(2)}%
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
