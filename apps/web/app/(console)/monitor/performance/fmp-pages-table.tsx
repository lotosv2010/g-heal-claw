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
import type { FmpPage, ThresholdTone } from "@/lib/api/performance";

/**
 * 首屏时间（FMP）页面表
 *
 * 取代"慢加载 Top 10"：按 FMP 均值倒序，展示页面维度的首屏体验分布。
 * 列：# / 页面 URL / 首屏时间 FMP 均值 / 页面完全加载（LCP 均值） / 3s 内打开率 / 采样数量
 *
 * FMP 着色阈值（与 FCP 近似）：
 *  - good        ≤ 1800ms
 *  - warn        ≤ 3000ms
 *  - destructive > 3000ms
 */
function fmpTone(ms: number): ThresholdTone {
  if (ms > 3000) return "destructive";
  if (ms > 1800) return "warn";
  return "good";
}

/** 3s 打开率越高越好：≥90% good / ≥70% warn / <70% destructive */
function openRateTone(ratio: number): ThresholdTone {
  if (ratio >= 0.9) return "good";
  if (ratio >= 0.7) return "warn";
  return "destructive";
}

export function FmpPagesTable({ rows }: { rows: readonly FmpPage[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>首屏时间（FMP）</CardTitle>
        <div className="text-muted-foreground text-xs">
          按页面维度聚合的首屏均值 · 按 FMP 均值倒序
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>页面 URL</TableHead>
              <TableHead className="text-right">首屏时间 FMP 均值</TableHead>
              <TableHead className="text-right">页面完全加载</TableHead>
              <TableHead className="text-right">3s 内打开率</TableHead>
              <TableHead className="text-right">采样数量</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.url}>
                <TableCell className="text-muted-foreground tabular-nums">
                  {i + 1}
                </TableCell>
                <TableCell className="text-foreground font-mono text-xs">
                  {r.url}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={fmpTone(r.fmpAvgMs)}>
                    {r.fmpAvgMs.toLocaleString()} ms
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {r.fullyLoadedAvgMs > 0
                    ? `${r.fullyLoadedAvgMs.toLocaleString()} ms`
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={openRateTone(r.within3sRatio)}>
                    {(r.within3sRatio * 100).toFixed(1)}%
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {r.sampleCount.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
