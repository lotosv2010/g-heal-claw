import dayjs from "dayjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ErrorSubType, ErrorTopGroup } from "@/lib/api/errors";

const SUB_TYPE_LABEL: Record<ErrorSubType, string> = {
  js: "JS",
  promise: "Promise",
  resource: "Resource",
  framework: "Framework",
  white_screen: "White Screen",
};

// shadcn Badge variant 映射（destructive 视觉冲击最强留给 JS 主要错误类型）
const SUB_TYPE_VARIANT: Record<
  ErrorSubType,
  "destructive" | "warn" | "brand" | "good" | "outline"
> = {
  js: "destructive",
  promise: "warn",
  resource: "brand",
  framework: "outline",
  white_screen: "outline",
};

/** Top N 异常分组表（GROUP BY sub_type, message_head） */
export function TopGroupsTable({ rows }: { rows: readonly ErrorTopGroup[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 分组</CardTitle>
        <div className="text-muted-foreground text-xs">
          按 (sub_type, message 前 128 字节) 字面分组，count 倒序
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">子类型</TableHead>
              <TableHead>消息</TableHead>
              <TableHead className="text-right">事件数</TableHead>
              <TableHead className="text-right">影响会话</TableHead>
              <TableHead className="text-right">最后出现</TableHead>
              <TableHead>样本 URL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.subType}:${r.messageHead}`}>
                <TableCell>
                  <Badge variant={SUB_TYPE_VARIANT[r.subType]}>
                    {SUB_TYPE_LABEL[r.subType]}
                  </Badge>
                </TableCell>
                <TableCell className="text-foreground max-w-xl truncate font-mono text-xs">
                  {r.messageHead}
                </TableCell>
                <TableCell className="text-foreground text-right tabular-nums">
                  {r.count.toLocaleString()}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {r.impactedSessions.toLocaleString()}
                </TableCell>
                <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                  {dayjs(r.lastSeen).format("MM-DD HH:mm")}
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {r.sampleUrl || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
