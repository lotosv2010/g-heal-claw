import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type CategoryCard,
  type ErrorCategory,
} from "@/lib/api/errors";

/**
 * 9 分类异常卡片（SPEC 顶部第 1 区）
 *
 * 顺序固定：js / promise / white_screen / ajax / js_load / image_load / css_load / media / api_code
 * 已采集 → 显示数值
 * 待采集 → 数值强制 0 + "待采集" Badge
 */

const CATEGORY_HINT: Record<ErrorCategory, string> = {
  js: "未捕获的 JS 运行时异常",
  promise: "未处理的 Promise 拒绝",
  white_screen: "页面长时间无首屏",
  ajax: "fetch / XHR 请求失败",
  js_load: "脚本资源加载失败",
  image_load: "图片资源加载失败",
  css_load: "样式表加载失败",
  media: "音视频资源加载失败",
  api_code: "接口业务状态码异常",
};

export function CategoryCards({
  items,
}: {
  items: readonly CategoryCard[];
}) {
  // 以 CATEGORY_ORDER 为准，items 缺项自动兜底为 0
  const map = new Map(items.map((x) => [x.category, x]));
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-9">
      {CATEGORY_ORDER.map((category) => {
        const card = map.get(category);
        const count = card?.count ?? 0;
        const collected = card?.collected ?? false;
        return (
          <Card key={category}>
            <CardHeader className="pb-0">
              <CardTitle className="text-muted-foreground text-xs font-medium">
                {CATEGORY_LABEL[category]}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="text-foreground text-2xl font-semibold tabular-nums">
                {collected ? count.toLocaleString() : 0}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-muted-foreground truncate text-[11px]">
                  {CATEGORY_HINT[category]}
                </span>
                {collected ? null : (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    待采集
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
