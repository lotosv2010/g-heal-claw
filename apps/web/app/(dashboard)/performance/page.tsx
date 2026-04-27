import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { getPerformanceOverview } from "@/lib/api/performance";
import { VitalsCards } from "./vitals-cards";
import { PageStagesBars } from "./page-stages-bars";
import { TrendChart } from "./trend-chart";
import { SlowPagesTable } from "./slow-pages-table";

// 服务端组件：骨架阶段仅从 mock fixture 同步读取
// TODO(T2.1.6)：替换为并发 fetch 真实 Dashboard API
export default async function PerformancePage() {
  const data = await getPerformanceOverview();
  return (
    <div>
      <PageHeader
        title="页面性能"
        description="Core Web Vitals、加载阶段、慢页面 Top 10"
        actions={<Badge variant="warn">本期数据来自 mock fixture</Badge>}
      />

      <section className="mb-6">
        <VitalsCards metrics={data.vitals} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendChart buckets={data.trend} />
        <PageStagesBars stages={data.stages} />
      </section>

      <section>
        <SlowPagesTable rows={data.slowPages} />
      </section>
    </div>
  );
}
