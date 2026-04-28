import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  buildCategoryCards,
  buildDimensions,
  buildRankingRows,
  buildStackBuckets,
  getErrorOverview,
  type ErrorOverviewResult,
} from "@/lib/api/errors";

import { CategoryCards } from "./category-cards";
import { RankingTable } from "./ranking-table";
import { StackChart } from "./stack-chart";
import { DimensionTabs } from "./dimension-tabs";

// 强制动态渲染：每次请求都从 apps/server 拉最新聚合结果，避免 SSG 冻结
export const dynamic = "force-dynamic";

type Source = ErrorOverviewResult["source"];

/**
 * 异常分析页面（SPEC 重构）
 *
 * 自上而下：
 *  1. 9 分类卡片（js / promise / white_screen / ajax / js_load / image_load / css_load / media / api_code）
 *  2. 错误排行表（类型 / 内容 / 状态 / 次数(占比) / 复现率 / 影响用户(占比) / 操作）
 *  3. 异常分析堆叠图（9 类目 + 全部日志共 10 条图例）
 *  4. 维度 Tabs（机型 / 浏览器 / 操作系统 / 版本 / 地域 / 运营商 / 网络 / 平台）
 *
 * 数据链路：
 *  - server 端已完成 9 分类拆分（resource 按 resource_kind 拆出 4 子类）+ ajax / api_code（SDK httpPlugin）
 *  - 维度 tabs：server 端已聚合 device / browser / os 三项；其余 5 项保留占位
 */
export default async function ErrorsPage() {
  const { source, data } = await getErrorOverview();

  const categoryCards = buildCategoryCards(data);
  const rankingRows = buildRankingRows(data);
  const stackBuckets = buildStackBuckets(data.categoryTrend);
  const dimensions = buildDimensions(data);

  return (
    <div>
      <PageHeader
        title="异常分析"
        description="JS / Promise / 资源加载 / 白屏 / 接口返回码等 9 类异常实时聚合"
        actions={<SourceBadge source={source} />}
      />

      {/* 1. 9 分类卡片 */}
      <section className="mb-6">
        <CategoryCards items={categoryCards} />
      </section>

      {/* 2. 错误排行 */}
      <section className="mb-6">
        <RankingTable rows={rankingRows} />
      </section>

      {/* 3. 异常分析（堆叠图） */}
      <section className="mb-6">
        <StackChart buckets={stackBuckets} />
      </section>

      {/* 4. 维度分布 tabs */}
      <section>
        <DimensionTabs dimensions={dimensions} />
      </section>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "live") {
    return <Badge variant="good">数据来自 error_events_raw</Badge>;
  }
  if (source === "empty") {
    return (
      <Badge variant="warn">暂无异常 · 请确保 SDK 已接入并触发 demo 路由</Badge>
    );
  }
  return <Badge variant="destructive">大盘 API 不可用 · 检查 apps/server</Badge>;
}
