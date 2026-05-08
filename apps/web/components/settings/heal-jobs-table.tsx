"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, XCircle } from "lucide-react";
import { listHealJobs, cancelHealJob, type HealJob } from "@/lib/api/heal";

interface Props {
  readonly projectId: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  queued: { label: "排队中", variant: "secondary" },
  diagnosing: { label: "诊断中", variant: "default" },
  patching: { label: "生成补丁", variant: "default" },
  verifying: { label: "验证中", variant: "default" },
  pr_created: { label: "PR 已创建", variant: "outline" },
  failed: { label: "失败", variant: "destructive" },
};

export function HealJobsTable({ projectId }: Props) {
  const [jobs, setJobs] = useState<HealJob[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listHealJobs(projectId);
      setJobs(res.data);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const handleCancel = async (jobId: string) => {
    await cancelHealJob(projectId, jobId);
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">修复任务</CardTitle>
          <p className="text-muted-foreground text-xs mt-1">
            AI 自动修复任务的执行状态
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          刷新
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="text-muted-foreground py-8 text-center text-sm">加载中...</p>
        ) : jobs.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            暂无修复任务 · 在 Issue 详情或 AI 对话中点击"触发自动修复"创建
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issue</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>PR</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const status = STATUS_MAP[job.status] ?? { label: job.status, variant: "secondary" as const };
                return (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs">{job.issueId.slice(0, 12)}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(job.createdAt).toLocaleString("zh-CN")}
                    </TableCell>
                    <TableCell>
                      {job.prUrl ? (
                        <a href={job.prUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline inline-flex items-center gap-1">
                          查看 PR <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {job.status === "queued" && (
                        <Button variant="ghost" size="sm" onClick={() => handleCancel(job.id)}>
                          <XCircle className="mr-1 size-3" /> 取消
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
