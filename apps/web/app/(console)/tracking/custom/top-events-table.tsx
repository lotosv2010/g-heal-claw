import dayjs from "dayjs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CustomEventTop } from "@/lib/api/custom";

/**
 * Top 事件表：按 name 分组，count 倒序
 *
 * 表头：事件名 · 触发次数 · 最近一次
 */
export function TopEventsTable({
  rows,
}: {
  rows: readonly CustomEventTop[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 事件</CardTitle>
        <div className="text-muted-foreground text-xs">
          按 name 分组；触发次数倒序；默认 TOP 10
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            当前窗口无 custom_event 样本
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>事件名</TableHead>
                <TableHead className="w-32 text-right">触发次数</TableHead>
                <TableHead className="w-40 text-right">最近一次</TableHead>
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
                  <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                    {dayjs(r.lastSeenMs).format("MM-DD HH:mm")}
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
