import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { listIssues, type IssueListItem } from "@/lib/api/issues";

export const dynamic = "force-dynamic";

export default async function IssuesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = (params?.status as string) || undefined;
  const page = Number(params?.page) || 1;

  const { data: issues, pagination } = await listIssues({ status, page });

  return (
    <div>
      <PageHeader
        title="Issues 列表"
        description="按指纹聚合的异常问题 · 支持状态筛选和排序"
      />

      {/* 状态筛选 */}
      <div className="mb-4 flex gap-2">
        <FilterLink href="/monitor/errors/issues" active={!status}>
          全部
        </FilterLink>
        <FilterLink
          href="/monitor/errors/issues?status=open"
          active={status === "open"}
        >
          Open
        </FilterLink>
        <FilterLink
          href="/monitor/errors/issues?status=resolved"
          active={status === "resolved"}
        >
          Resolved
        </FilterLink>
        <FilterLink
          href="/monitor/errors/issues?status=ignored"
          active={status === "ignored"}
        >
          Ignored
        </FilterLink>
      </div>

      {/* Issues 表格 */}
      {issues.length === 0 ? (
        <div className="bg-card rounded-lg border p-8 text-center">
          <p className="text-muted-foreground text-sm">
            暂无 Issues · 确认 SDK 已接入且有错误事件上报
          </p>
        </div>
      ) : (
        <div className="bg-card overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="px-4 py-3 text-left font-medium">Issue</th>
                <th className="px-4 py-3 text-left font-medium">类型</th>
                <th className="px-4 py-3 text-left font-medium">状态</th>
                <th className="px-4 py-3 text-right font-medium">事件数</th>
                <th className="px-4 py-3 text-right font-medium">影响会话</th>
                <th className="px-4 py-3 text-left font-medium">最近出现</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <IssueRow key={issue.id} issue={issue} />
              ))}
            </tbody>
          </table>

          {/* 分页 */}
          {pagination.total > pagination.limit && (
            <div className="border-t px-4 py-3 flex items-center justify-between">
              <span className="text-muted-foreground text-xs">
                共 {pagination.total} 条
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/monitor/errors/issues?page=${page - 1}${status ? `&status=${status}` : ""}`}
                    className="text-primary text-xs hover:underline"
                  >
                    上一页
                  </Link>
                )}
                {page * pagination.limit < pagination.total && (
                  <Link
                    href={`/monitor/errors/issues?page=${page + 1}${status ? `&status=${status}` : ""}`}
                    className="text-primary text-xs hover:underline"
                  >
                    下一页
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: IssueListItem }) {
  const statusVariant =
    issue.status === "open"
      ? "destructive"
      : issue.status === "resolved"
        ? "good"
        : "secondary";

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <Link
          href={`/monitor/errors/issues/${issue.id}`}
          className="text-primary hover:underline font-medium"
        >
          <span className="line-clamp-1">{issue.title || "(无标题)"}</span>
        </Link>
        <div className="text-muted-foreground mt-0.5 text-xs truncate max-w-[400px]">
          {issue.fingerprint.slice(0, 16)}…
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className="text-xs">
          {issue.subType}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <Badge variant={statusVariant as "destructive" | "default"} className="text-xs capitalize">
          {issue.status}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {issue.eventCount.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {issue.impactedSessions.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">
        {formatRelative(issue.lastSeen)}
      </td>
    </tr>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}
