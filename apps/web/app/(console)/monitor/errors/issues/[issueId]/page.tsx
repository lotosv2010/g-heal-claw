import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getIssueDetail } from "@/lib/api/issues";
import { IssueStatusActions } from "./issue-status-actions";

export const dynamic = "force-dynamic";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const { issueId } = await params;
  const issue = await getIssueDetail(issueId);

  if (!issue) {
    notFound();
  }

  const statusVariant =
    issue.status === "open"
      ? "destructive"
      : issue.status === "resolved"
        ? "good"
        : "secondary";

  return (
    <div>
      <PageHeader
        title={issue.title || "(无标题)"}
        description={`${issue.subType} · ${issue.fingerprint.slice(0, 16)}…`}
        actions={
          <div className="flex items-center gap-3">
            <IssueStatusActions issueId={issueId} currentStatus={issue.status} />
            <Badge variant={statusVariant as "destructive" | "default"} className="capitalize">
              {issue.status}
            </Badge>
            <Link
              href="/monitor/errors/issues"
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              返回列表
            </Link>
          </div>
        }
      />

      {/* 概览卡片 */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="事件总数" value={issue.eventCount.toLocaleString()} />
        <StatCard label="影响会话" value={issue.impactedSessions.toLocaleString()} />
        <StatCard label="首次出现" value={formatTime(issue.firstSeen)} />
        <StatCard label="最近出现" value={formatTime(issue.lastSeen)} />
      </div>

      {/* 近期事件 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">近期事件样本</CardTitle>
        </CardHeader>
        <CardContent>
          {issue.recentEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无关联事件</p>
          ) : (
            <div className="space-y-3">
              {issue.recentEvents.map((event) => (
                <div
                  key={event.eventId}
                  className="rounded-lg border p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      {event.eventId.slice(0, 12)}…
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatTime(event.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm font-medium line-clamp-2">
                    {event.message}
                  </p>
                  {event.stack && (
                    <pre className="bg-muted rounded p-3 text-xs overflow-x-auto max-h-[200px] overflow-y-auto">
                      {event.stack}
                    </pre>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {event.browser && <Badge variant="outline">{event.browser}</Badge>}
                    {event.os && <Badge variant="outline">{event.os}</Badge>}
                    {event.deviceType && (
                      <Badge variant="outline">{event.deviceType}</Badge>
                    )}
                    {event.environment && (
                      <Badge variant="outline">{event.environment}</Badge>
                    )}
                    {event.url && (
                      <span className="truncate max-w-[300px]" title={event.url}>
                        {event.url}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-foreground mt-1 text-lg font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
