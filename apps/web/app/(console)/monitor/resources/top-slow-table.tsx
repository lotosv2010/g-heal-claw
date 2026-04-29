import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RESOURCE_CATEGORY_LABEL,
  type ResourcesTopSlowRow,
} from "@/lib/api/resources";

/**
 * Top 慢资源表：按 (category, host, url) 分组，p75 倒序
 *
 * 表头：类型 · Host · URL · 样本数 · p75(ms) · 失败率
 */
export function TopSlowTable({
  rows,
}: {
  rows: readonly ResourcesTopSlowRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 慢资源</CardTitle>
        <div className="text-muted-foreground text-xs">
          按 (category, host, url) 分组；p75 倒序；默认 TOP 10
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            当前窗口无资源样本
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">类型</TableHead>
                <TableHead className="w-48">Host</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="w-24 text-right">样本数</TableHead>
                <TableHead className="w-28 text-right">p75 (ms)</TableHead>
                <TableHead className="w-24 text-right">失败率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={`${r.category}:${r.host}:${r.url}:${idx}`}>
                  <TableCell>
                    <Badge variant="outline">
                      {RESOURCE_CATEGORY_LABEL[r.category]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground truncate font-mono text-xs">
                    {r.host || "—"}
                  </TableCell>
                  <TableCell className="text-foreground max-w-xl truncate font-mono text-xs">
                    {r.url}
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
        )}
      </CardContent>
    </Card>
  );
}
