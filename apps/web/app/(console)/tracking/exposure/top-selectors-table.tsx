import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExposureTopSelectorRow } from "@/lib/api/exposure";

/**
 * Top 曝光元素表：按 selector（回落 event_name）聚合，曝光量倒序
 *
 * 列：元素 / 文案样本 · 曝光量 · 去重用户 · 页面数 · 占比
 */
export function TopSelectorsTable({
  rows,
}: {
  rows: readonly ExposureTopSelectorRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        当前窗口无曝光样本
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>元素 / 文案样本</TableHead>
          <TableHead className="w-20 text-right">曝光量</TableHead>
          <TableHead className="w-20 text-right">用户</TableHead>
          <TableHead className="w-16 text-right">页面</TableHead>
          <TableHead className="w-16 text-right">占比</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, idx) => (
          <TableRow key={`${r.selector}:${idx}`}>
            <TableCell className="max-w-xl">
              <div className="text-foreground truncate font-mono text-xs">
                {r.selector || "(未命名)"}
              </div>
              {r.sampleText ? (
                <div className="text-muted-foreground truncate text-[11px]">
                  “{r.sampleText}”
                </div>
              ) : null}
            </TableCell>
            <TableCell className="text-foreground text-right tabular-nums">
              {r.count.toLocaleString()}
            </TableCell>
            <TableCell className="text-foreground text-right tabular-nums">
              {r.uniqueUsers.toLocaleString()}
            </TableCell>
            <TableCell className="text-muted-foreground text-right tabular-nums">
              {r.uniquePages.toLocaleString()}
            </TableCell>
            <TableCell className="text-muted-foreground text-right tabular-nums">
              {r.sharePercent.toFixed(2)}%
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
