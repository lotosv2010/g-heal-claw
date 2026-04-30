import dayjs from "dayjs";
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
  LOG_LEVEL_LABEL,
  LOG_LEVEL_TONE,
  type LogTopMessage,
} from "@/lib/api/logs";
import { cn } from "@/lib/utils";

/**
 * Top 消息表：按 (level, messageHead) 分组，count 倒序
 *
 * 表头：级别 · 消息前缀 · 次数 · 最近一次
 */
export function TopMessagesTable({
  rows,
}: {
  rows: readonly LogTopMessage[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 日志消息</CardTitle>
        <div className="text-muted-foreground text-xs">
          按 (level, messageHead 前 128 字符) 分组；触发次数倒序；默认 TOP 10
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            当前窗口无日志消息
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">级别</TableHead>
                <TableHead>消息前缀</TableHead>
                <TableHead className="w-24 text-right">触发次数</TableHead>
                <TableHead className="w-40 text-right">最近一次</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={`${r.level}:${r.messageHead}:${idx}`}>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(LOG_LEVEL_TONE[r.level])}
                    >
                      {LOG_LEVEL_LABEL[r.level]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-foreground truncate font-mono text-xs max-w-2xl">
                    {r.messageHead}
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
