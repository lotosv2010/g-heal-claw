"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { ExternalLink, XCircle, RotateCw, Trash2, Eye, GitBranch, Search, FileCode, Wrench, CheckCircle2, AlertCircle, Loader2, Download, CircleCheck, Clock } from "lucide-react";
import { listHealJobs, cancelHealJob, deleteHealJob, retryHealJob, approveHealJob, getHealJob, type HealJob, type HealTraceEntry } from "@/lib/api/heal";

interface Props {
  readonly projectId: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  queued: { label: "排队中", variant: "secondary" },
  cloning: { label: "克隆仓库", variant: "default" },
  diagnosing: { label: "诊断中", variant: "default" },
  awaiting_approval: { label: "待确认", variant: "outline" },
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

  // 有运行中的任务时自动轮询（3 秒）
  const RUNNING_STATUSES = new Set(["queued", "cloning", "diagnosing", "patching", "verifying"]);
  const hasRunning = jobs.some((j) => RUNNING_STATUSES.has(j.status));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { load(); }, [projectId]);

  useEffect(() => {
    if (hasRunning) {
      timerRef.current = setInterval(() => { load(); }, 8000);
    }
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [hasRunning]);

  const handleCancel = async (jobId: string) => {
    await cancelHealJob(projectId, jobId);
    load();
  };

  const handleRetry = async (job: HealJob) => {
    await retryHealJob(projectId, job);
    load();
  };

  const handleDelete = async (jobId: string) => {
    await deleteHealJob(projectId, jobId);
    load();
  };

  const handleApprove = async (jobId: string) => {
    await approveHealJob(projectId, jobId);
    load();
  };

  const [detailJob, setDetailJob] = useState<HealJob | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleViewDetail = async (jobId: string) => {
    setDetailLoading(true);
    try {
      const job = await getHealJob(projectId, jobId);
      setDetailJob(job);
    } catch {
      setDetailJob(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // 详情面板打开且任务运行中时，自动刷新详情
  const detailTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (detailJob && RUNNING_STATUSES.has(detailJob.status)) {
      detailTimerRef.current = setInterval(async () => {
        try {
          const updated = await getHealJob(projectId, detailJob.id);
          setDetailJob(updated);
        } catch {}
      }, 8000);
    }
    return () => {
      if (detailTimerRef.current) { clearInterval(detailTimerRef.current); detailTimerRef.current = null; }
    };
  }, [detailJob?.id, detailJob?.status]);

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
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => handleViewDetail(job.id)}>
                        <Eye className="mr-1 size-3" /> 详情
                      </Button>
                      {job.status === "awaiting_approval" && (
                        <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700" onClick={() => handleApprove(job.id)}>
                          <CircleCheck className="mr-1 size-3" /> 确认修复
                        </Button>
                      )}
                      {RUNNING_STATUSES.has(job.status) && (
                        <Button variant="ghost" size="sm" onClick={() => handleCancel(job.id)}>
                          <XCircle className="mr-1 size-3" /> 取消
                        </Button>
                      )}
                      {job.status === "failed" && (
                        <Button variant="ghost" size="sm" onClick={() => handleRetry(job)}>
                          <RotateCw className="mr-1 size-3" /> 重试
                        </Button>
                      )}
                      {(job.status === "failed" || job.status === "pr_created") && (
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(job.id)}>
                          <Trash2 className="mr-1 size-3" /> 删除
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* 修复进度详情面板 */}
        {detailJob && (
          <div className="border-t p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium">修复流程 · {detailJob.id.slice(0, 16)}</h4>
              <Button variant="ghost" size="sm" onClick={() => setDetailJob(null)}>关闭</Button>
            </div>

            {/* 流程步骤 */}
            <HealPipeline job={detailJob} />

            {/* 终端风格日志输出 */}
            <TerminalLog job={detailJob} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 流程管线组件 ──

const PIPELINE_STEPS = [
  { key: "queued", label: "排队", icon: Loader2 },
  { key: "cloning", label: "克隆仓库", icon: Download },
  { key: "diagnosing", label: "诊断", icon: Search },
  { key: "awaiting_approval", label: "待确认", icon: Clock },
  { key: "patching", label: "生成补丁", icon: FileCode },
  { key: "verifying", label: "验证", icon: Wrench },
  { key: "pr_created", label: "PR 已创建", icon: GitBranch },
] as const;

const STATUS_ORDER: Record<string, number> = {
  queued: 0,
  cloning: 1,
  diagnosing: 2,
  awaiting_approval: 3,
  patching: 4,
  verifying: 5,
  pr_created: 6,
  failed: -1,
};

function inferFailedStepIdx(job: HealJob): number {
  // 从 trace 中推断实际执行到了哪个阶段
  if (!job.trace || job.trace.length === 0) return 0;
  const traceText = job.trace.map((t) => t.content).join(" ");
  if (traceText.includes("Agent") || traceText.includes("诊断")) return STATUS_ORDER["diagnosing"];
  if (traceText.includes("克隆完成") || traceText.includes("仓库克隆完成")) return STATUS_ORDER["diagnosing"];
  if (traceText.includes("克隆")) return STATUS_ORDER["cloning"];
  return STATUS_ORDER["queued"];
}

function HealPipeline({ job }: { job: HealJob }) {
  const isFailed = job.status === "failed";
  const currentIdx = isFailed ? inferFailedStepIdx(job) : (STATUS_ORDER[job.status] ?? 0);

  return (
    <div className="flex items-center gap-1">
      {PIPELINE_STEPS.map((step, idx) => {
        const Icon = step.icon;
        let state: "done" | "active" | "pending" | "failed" = "pending";
        if (isFailed) {
          if (idx < currentIdx) state = "done";
          else if (idx === currentIdx) state = "failed";
        } else if (idx < currentIdx) {
          state = "done";
        } else if (idx === currentIdx) {
          state = job.status === "pr_created" ? "done" : "active";
        }

        return (
          <div key={step.key} className="flex items-center gap-1">
            {idx > 0 && (
              <div className={`h-px w-4 ${state === "pending" ? "bg-border" : state === "failed" ? "bg-destructive/40" : state === "done" ? "bg-green-500/40" : "bg-primary/40"}`} />
            )}
            <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              state === "done" ? "bg-green-500/10 text-green-600 dark:text-green-400" :
              state === "active" ? "bg-primary text-primary-foreground" :
              state === "failed" ? "bg-destructive/10 text-destructive" :
              "bg-muted text-muted-foreground"
            }`}>
              {state === "done" ? <CheckCircle2 className="size-3" /> :
               state === "failed" ? <AlertCircle className="size-3" /> :
               state === "active" ? <Icon className="size-3 animate-pulse" /> :
               <Icon className="size-3" />}
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 终端风格日志组件 ──

const ROLE_PREFIX: Record<string, { symbol: string; color: string }> = {
  action: { symbol: "▶", color: "text-green-400" },
  observation: { symbol: "●", color: "text-blue-400" },
  thought: { symbol: "◆", color: "text-yellow-400" },
};

function TerminalLog({ job }: { job: HealJob }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isRunning = ["queued", "cloning", "diagnosing", "patching", "verifying"].includes(job.status);

  // 自动滚动到底部
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [job.trace?.length]);

  return (
    <div className="mt-4 rounded-lg overflow-hidden border border-zinc-700">
      {/* 终端标题栏 */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border-b border-zinc-700">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-red-500" />
          <span className="size-2.5 rounded-full bg-yellow-500" />
          <span className="size-2.5 rounded-full bg-green-500" />
        </div>
        <span className="text-zinc-400 text-[11px] font-mono ml-2">heal-agent — {job.id.slice(0, 16)}</span>
        {isRunning && <span className="ml-auto text-[10px] text-green-400 animate-pulse">● running</span>}
      </div>

      {/* 终端内容区 */}
      <div
        ref={containerRef}
        className="bg-zinc-900 p-3 font-mono text-[12px] leading-5 max-h-[360px] overflow-y-auto"
      >
        {(!job.trace || job.trace.length === 0) ? (
          <div className="text-zinc-500">
            {isRunning ? "等待输出..." : "无执行日志"}
          </div>
        ) : (
          job.trace.map((entry, i) => {
            const prefix = ROLE_PREFIX[entry.role] ?? { symbol: "·", color: "text-zinc-400" };
            const time = new Date(entry.timestamp).toLocaleTimeString("zh-CN", { hour12: false });
            const isError = entry.content.startsWith("ERROR") || entry.content.startsWith("执行失败");
            return (
              <div key={i} className="flex gap-0 hover:bg-zinc-800/50 -mx-1 px-1 rounded">
                <span className="text-zinc-600 shrink-0 w-[72px] select-none">{time}</span>
                <span className={`shrink-0 w-4 ${prefix.color}`}>{prefix.symbol}</span>
                <span className={`whitespace-pre-wrap break-all ${isError ? "text-red-400" : "text-zinc-300"}`}>
                  {entry.content}
                </span>
              </div>
            );
          })
        )}
        {isRunning && (
          <div className="flex items-center gap-1 mt-1 text-zinc-500">
            <span className="animate-pulse">▌</span>
          </div>
        )}
      </div>

      {/* 诊断结果/错误摘要 */}
      {(job.diagnosis || job.errorMessage) && (
        <div className="border-t border-zinc-700 bg-zinc-850 px-3 py-2">
          {job.errorMessage && (
            <div className="text-red-400 text-[11px] font-mono whitespace-pre-wrap">
              <span className="text-red-500 font-bold">ERROR </span>{job.errorMessage}
            </div>
          )}
          {job.diagnosis && !job.errorMessage && (
            <div className="text-green-400 text-[11px] font-mono whitespace-pre-wrap line-clamp-5">
              <span className="text-green-500 font-bold">DONE </span>{job.diagnosis.slice(0, 500)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
