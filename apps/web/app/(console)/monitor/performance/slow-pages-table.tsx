import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { SlowPage, ThresholdTone } from "@/lib/api/performance";

// LCP 阈值着色：对齐 PRD §2.1 · > 4s 差（destructive）/ > 2.5s 需改进（warn）/ ≤ 2.5s 良好（good）
function lcpTone(ms: number): ThresholdTone {
  if (ms > 4000) return "destructive";
  if (ms > 2500) return "warn";
  return "good";
}

export function SlowPagesTable({ rows }: { rows: readonly SlowPage[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>慢加载 Top 10 页面</CardTitle>
        <div className="text-muted-foreground text-xs">按 LCP p75 倒序</div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead className="text-right">样本数</TableHead>
              <TableHead className="text-right">LCP p75</TableHead>
              <TableHead className="text-right">TTFB p75</TableHead>
              <TableHead className="text-right">跳出率</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.url}>
                <TableCell className="text-foreground font-mono text-xs">
                  {r.url}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {r.sampleCount.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={lcpTone(r.lcpP75Ms)}>
                    {r.lcpP75Ms.toLocaleString()} ms
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {r.ttfbP75Ms.toLocaleString()} ms
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {(r.bounceRate * 100).toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
