import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiTopErrorStatusRow } from "@/lib/api/api";

/**
 * HTTP 异常状态码 TOP 表：仅统计 4xx / 5xx / 0（网络失败）
 *
 * 展示：状态码 · 语义标签 · 次数 · 占全窗口比
 * 用途：定位高频业务错误 / 依赖故障
 */
export function TopErrorStatusTable({
  rows,
}: {
  rows: readonly ApiTopErrorStatusRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        当前窗口无 4xx / 5xx / 网络失败样本
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">状态码</TableHead>
          <TableHead>类型</TableHead>
          <TableHead>说明</TableHead>
          <TableHead className="w-24 text-right">次数</TableHead>
          <TableHead className="w-24 text-right">占比</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, idx) => {
          const meta = describeStatus(r.status);
          return (
            <TableRow key={`${r.status}:${idx}`}>
              <TableCell className="font-mono text-sm font-semibold tabular-nums">
                {r.status}
              </TableCell>
              <TableCell>
                <Badge variant={meta.badge}>{meta.kind}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {meta.hint}
              </TableCell>
              <TableCell className="text-foreground text-right tabular-nums">
                {r.count.toLocaleString()}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {(r.ratio * 100).toFixed(2)}%
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

interface StatusMeta {
  readonly kind: string;
  readonly hint: string;
  readonly badge: "destructive" | "warn" | "outline";
}

function describeStatus(status: number): StatusMeta {
  if (status === 0) {
    return {
      kind: "网络失败",
      hint: "DNS / 超时 / CORS / 断网",
      badge: "outline",
    };
  }
  if (status >= 500) {
    return {
      kind: "5xx 服务端",
      hint: commonMessage(status),
      badge: "destructive",
    };
  }
  if (status >= 400) {
    return {
      kind: "4xx 客户端",
      hint: commonMessage(status),
      badge: "warn",
    };
  }
  return { kind: "其他", hint: "非标准异常", badge: "outline" };
}

function commonMessage(status: number): string {
  const table: Record<number, string> = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    408: "Request Timeout",
    409: "Conflict",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
  };
  return table[status] ?? "其他异常状态";
}
