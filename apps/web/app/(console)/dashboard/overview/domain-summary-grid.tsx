import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  DomainSource,
  OverviewSummary,
} from "@/lib/api/overview";

/**
 * 5 域等宽 Summary 卡片网格（ADR-0029 §4）
 *
 * 每卡 2~3 个核心 KPI + 跳转链接到对应子页。
 * 单域 source=error → 小红角标；source=empty → 灰色占位。
 */
export function DomainSummaryGrid({ data }: { data: OverviewSummary }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
      <DomainCard
        title="异常分析"
        href="/monitor/errors"
        source={data.errors.source}
        primary={data.errors.totalEvents.toLocaleString()}
        primaryLabel="事件数"
        metrics={[
          {
            label: "受影响会话",
            value: data.errors.impactedSessions.toLocaleString(),
          },
          {
            label: "环比",
            value:
              data.errors.deltaDirection === "flat" ||
              data.errors.deltaPercent === 0
                ? "持平"
                : `${data.errors.deltaDirection === "up" ? "↑" : "↓"} ${data.errors.deltaPercent.toFixed(1)}%`,
          },
        ]}
      />

      <DomainCard
        title="页面性能"
        href="/monitor/performance"
        source={data.performance.source}
        primary={`${data.performance.lcpP75Ms}ms`}
        primaryLabel="LCP p75"
        primaryTone={data.performance.tone}
        metrics={[
          { label: "INP p75", value: `${data.performance.inpP75Ms}ms` },
          { label: "CLS p75", value: data.performance.clsP75.toFixed(3) },
        ]}
      />

      <DomainCard
        title="API 监控"
        href="/monitor/api"
        source={data.api.source}
        primary={`${(data.api.errorRate * 100).toFixed(2)}%`}
        primaryLabel="错误率"
        metrics={[
          {
            label: "请求数",
            value: data.api.totalRequests.toLocaleString(),
          },
          { label: "p75 时延", value: `${data.api.p75DurationMs}ms` },
        ]}
      />

      <DomainCard
        title="静态资源"
        href="/monitor/resources"
        source={data.resources.source}
        primary={`${(data.resources.failureRate * 100).toFixed(2)}%`}
        primaryLabel="失败率"
        metrics={[
          {
            label: "请求数",
            value: data.resources.totalRequests.toLocaleString(),
          },
          {
            label: "慢资源",
            value: data.resources.slowCount.toLocaleString(),
          },
        ]}
      />

      <DomainCard
        title="页面访问"
        href="/monitor/visits"
        source={data.visits.source}
        primary={data.visits.pv.toLocaleString()}
        primaryLabel="PV"
        metrics={[
          { label: "UV", value: data.visits.uv.toLocaleString() },
          {
            label: "SPA 占比",
            value: `${(data.visits.spaRatio * 100).toFixed(1)}%`,
          },
        ]}
      />
    </div>
  );
}

interface DomainCardProps {
  title: string;
  href: string;
  source: DomainSource;
  primary: string;
  primaryLabel: string;
  primaryTone?: "good" | "warn" | "destructive" | "unknown";
  metrics: readonly { label: string; value: string }[];
}

function DomainCard({
  title,
  href,
  source,
  primary,
  primaryLabel,
  primaryTone,
  metrics,
}: DomainCardProps) {
  return (
    <Link
      href={href}
      className="block transition hover:opacity-90"
      aria-label={`${title}子页面`}
    >
      <Card className="h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-muted-foreground text-xs font-medium">
              {title}
            </CardTitle>
            <SourceTag source={source} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                toneColor(primaryTone),
              )}
            >
              {source === "live" ? primary : "—"}
            </span>
            <span className="text-muted-foreground text-[11px]">
              {primaryLabel}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            {metrics.map((m) => (
              <div key={m.label}>
                <dt className="text-muted-foreground text-[11px]">
                  {m.label}
                </dt>
                <dd className="text-foreground text-sm font-medium tabular-nums">
                  {source === "live" ? m.value : "—"}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </Link>
  );
}

function SourceTag({ source }: { source: DomainSource }) {
  if (source === "live") return null;
  if (source === "empty") {
    return <Badge variant="outline">无样本</Badge>;
  }
  return <Badge variant="destructive">数据异常</Badge>;
}

function toneColor(
  tone: "good" | "warn" | "destructive" | "unknown" | undefined,
): string {
  switch (tone) {
    case "good":
      return "text-emerald-600";
    case "warn":
      return "text-amber-600";
    case "destructive":
      return "text-red-600";
    default:
      return "text-foreground";
  }
}
