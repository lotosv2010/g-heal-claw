import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ErrorSubType, ErrorSubTypeRatio } from "@/lib/api/errors";

/**
 * 子类型占比环形图（纯 CSS conic-gradient，不引图表库）
 *
 * - 右侧图例显示 subType / count / percent
 * - 空数据（ratios 全 0）渲染灰色满环 + 占位图例
 */

const SUB_TYPE_LABEL: Record<ErrorSubType, string> = {
  js: "JS 运行时",
  promise: "Promise 拒绝",
  resource: "资源加载",
  framework: "框架",
  white_screen: "白屏",
};

// AntD 色板 Blue/Green/Gold/Purple/Red
const SUB_TYPE_COLOR: Record<ErrorSubType, string> = {
  js: "#f5222d",
  promise: "#faad14",
  resource: "#1677ff",
  framework: "#722ed1",
  white_screen: "#13c2c2",
};

export function SubTypeDonut({
  items,
}: {
  items: readonly ErrorSubTypeRatio[];
}) {
  const total = items.reduce((sum, x) => sum + x.count, 0);
  const gradient = buildConicGradient(items, total);

  return (
    <Card>
      <CardHeader>
        <CardTitle>按子类型分布</CardTitle>
        <div className="text-muted-foreground text-xs">
          sub_type × count 占比
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <div
          className="relative h-40 w-40 shrink-0 rounded-full"
          style={{ background: gradient }}
          aria-label="子类型占比环"
        >
          {/* 中空圆：用背景色覆盖中心 */}
          <div className="bg-background absolute inset-6 flex flex-col items-center justify-center rounded-full">
            <div className="text-foreground text-xl font-semibold tabular-nums">
              {total.toLocaleString()}
            </div>
            <div className="text-muted-foreground text-xs">事件</div>
          </div>
        </div>

        <ul className="flex-1 space-y-2 text-sm">
          {items.map((item) => (
            <li
              key={item.subType}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: SUB_TYPE_COLOR[item.subType] }}
                />
                <span className="text-foreground">
                  {SUB_TYPE_LABEL[item.subType]}
                </span>
              </div>
              <div className="text-muted-foreground flex items-center gap-3 tabular-nums">
                <span>{item.count.toLocaleString()}</span>
                <span className="w-12 text-right">
                  {(item.ratio * 100).toFixed(1)}%
                </span>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function buildConicGradient(
  items: readonly ErrorSubTypeRatio[],
  total: number,
): string {
  if (total === 0) {
    // 全空时渲染灰色满环
    return "conic-gradient(#e5e7eb 0deg 360deg)";
  }
  const segments: string[] = [];
  let cursor = 0;
  for (const item of items) {
    if (item.count === 0) continue;
    const next = cursor + item.ratio * 360;
    segments.push(
      `${SUB_TYPE_COLOR[item.subType]} ${cursor}deg ${next}deg`,
    );
    cursor = next;
  }
  // 浮点误差兜底：余数填灰色
  if (cursor < 360) {
    segments.push(`#e5e7eb ${cursor}deg 360deg`);
  }
  return `conic-gradient(${segments.join(", ")})`;
}
