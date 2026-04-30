import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { VisitsTopReferrerRow } from "@/lib/api/visits";

/**
 * 引荐来源 TOP：按 referrer_host 聚合 PV / 占比
 *
 * 数据来源：page_view_raw.referrer_host（为空归 "direct"）
 * 用途：识别外部流量主要来源
 */
export function TopReferrers({
  rows,
}: {
  rows: readonly VisitsTopReferrerRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>引荐来源 TOP</CardTitle>
        <div className="text-muted-foreground text-xs">
          按 referrer_host 聚合 · PV 倒序 · 空值归为 direct
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            当前窗口无引荐来源样本
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>来源 Host</TableHead>
                <TableHead className="w-24 text-right">PV</TableHead>
                <TableHead className="w-24 text-right">占比</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={`${r.referrerHost}:${idx}`}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="text-foreground max-w-xl truncate font-mono text-xs">
                    {r.referrerHost}
                  </TableCell>
                  <TableCell className="text-foreground text-right tabular-nums">
                    {r.pv.toLocaleString()}
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
