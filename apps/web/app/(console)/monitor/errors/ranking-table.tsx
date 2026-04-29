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
import {
  CATEGORY_LABEL,
  type ErrorCategory,
  type ErrorRankingRow,
  type IssueStatus,
} from "@/lib/api/errors";

/**
 * 错误排行（SPEC 第 2 区）
 *
 * 表头：错误类型 · 错误内容 · 问题状态 · 发生次数(占比) · 复现率 · 影响用户数(占比) · 操作
 *
 * - 当前版本后端未持久化 issue 状态与"操作"闭环；状态一律 `unresolved`，操作按钮目前占位（禁用）
 * - 复现率 = impactedSessions / count
 * - 占比百分比均保留 1 位小数
 */

// 类型 Badge 色板：与堆叠图保持同色（后续如需统一抽到 theme 再说）
const CATEGORY_VARIANT: Record<
  ErrorCategory,
  "destructive" | "warn" | "brand" | "good" | "outline"
> = {
  js: "destructive",
  promise: "warn",
  white_screen: "brand",
  ajax: "warn",
  js_load: "outline",
  image_load: "outline",
  css_load: "outline",
  media: "outline",
  api_code: "outline",
};

const STATUS_LABEL: Record<IssueStatus, string> = {
  unresolved: "未处理",
  resolved: "已修复",
  ignored: "已忽略",
};

const STATUS_VARIANT: Record<
  IssueStatus,
  "destructive" | "good" | "outline"
> = {
  unresolved: "destructive",
  resolved: "good",
  ignored: "outline",
};

export function RankingTable({
  rows,
}: {
  rows: readonly ErrorRankingRow[];
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>错误排行</CardTitle>
          <div className="text-muted-foreground text-xs">
            按 (错误类型, 消息前 128 字节) 分组，事件数倒序
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground py-10 text-center text-sm">
            当前窗口无错误分组数据
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>错误排行</CardTitle>
        <div className="text-muted-foreground text-xs">
          按 (错误类型, 消息前 128 字节) 分组，事件数倒序
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">错误类型</TableHead>
              <TableHead>错误内容</TableHead>
              <TableHead className="w-20">问题状态</TableHead>
              <TableHead className="w-32 text-right">发生次数(占比)</TableHead>
              <TableHead className="w-24 text-right">复现率</TableHead>
              <TableHead className="w-32 text-right">影响用户数(占比)</TableHead>
              <TableHead className="w-20">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell>
                  <Badge variant={CATEGORY_VARIANT[r.category]}>
                    {CATEGORY_LABEL[r.category]}
                  </Badge>
                </TableCell>
                <TableCell className="text-foreground max-w-xl truncate font-mono text-xs">
                  {r.messageHead || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status]}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-foreground text-right tabular-nums">
                  <div>{r.count.toLocaleString()}</div>
                  <div className="text-muted-foreground text-[11px]">
                    {(r.countRatio * 100).toFixed(1)}%
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {(r.reproRate * 100).toFixed(1)}%
                </TableCell>
                <TableCell className="text-foreground text-right tabular-nums">
                  <div>{r.impactedUsers.toLocaleString()}</div>
                  <div className="text-muted-foreground text-[11px]">
                    {(r.impactedUsersRatio * 100).toFixed(1)}%
                  </div>
                </TableCell>
                <TableCell>
                  {/* 闭环尚未接入：按钮占位禁用；接入后替换为跳转详情 / 状态切换 */}
                  <button
                    type="button"
                    disabled
                    className="text-muted-foreground cursor-not-allowed text-xs underline-offset-2 hover:underline"
                    title="详情页开发中"
                  >
                    详情
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
