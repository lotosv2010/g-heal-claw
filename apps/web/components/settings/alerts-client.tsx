"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "./confirm-dialog";
import { CreateAlertDialog } from "./create-alert-dialog";
import {
  toggleAlertRule,
  deleteAlertRule,
  type AlertRule,
  type AlertHistory,
} from "@/lib/api/alerts";

interface AlertsClientProps {
  readonly projectId: string;
  readonly initialRules: readonly AlertRule[];
  readonly initialHistory: readonly AlertHistory[];
}

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  critical: "destructive",
  warning: "default",
  info: "secondary",
};

const TARGET_LABELS: Record<string, string> = {
  error_rate: "错误率",
  api_success_rate: "API 成功率",
  web_vital: "Web Vital",
  issue_count: "Issue 数量",
  custom_metric: "自定义指标",
};

function formatWindowMs(ms: number): string {
  if (ms >= 3600000) return `${ms / 3600000}h`;
  if (ms >= 60000) return `${ms / 60000}m`;
  return `${ms / 1000}s`;
}

export function AlertsClient({ projectId, initialRules, initialHistory }: AlertsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<"rules" | "history">("rules");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<AlertRule | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [toggling, setToggling] = React.useState<string | null>(null);

  const refresh = () => router.refresh();

  const handleToggle = async (rule: AlertRule) => {
    setToggling(rule.id);
    try {
      await toggleAlertRule(projectId, rule.id, !rule.enabled);
      refresh();
    } catch {
      // 静默
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAlertRule(projectId, deleteTarget.id);
      setDeleteTarget(null);
      refresh();
    } catch {
      // 静默
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">告警规则</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          创建规则
        </Button>
      </div>

      {/* Tab 切换 */}
      <div className="mb-4 flex gap-1 border-b">
        <button
          type="button"
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === "rules"
              ? "border-primary text-primary border-b-2"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("rules")}
        >
          规则列表
        </button>
        <button
          type="button"
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === "history"
              ? "border-primary text-primary border-b-2"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("history")}
        >
          触发历史
        </button>
      </div>

      {activeTab === "rules" && (
        <>
          {initialRules.length === 0 ? (
            <p className="text-muted-foreground py-20 text-center text-sm">
              暂无告警规则
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>监控目标</TableHead>
                  <TableHead>级别</TableHead>
                  <TableHead>启用</TableHead>
                  <TableHead>最近触发</TableHead>
                  <TableHead className="w-24">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="text-sm font-medium">{rule.name}</TableCell>
                    <TableCell className="text-sm">
                      {TARGET_LABELS[rule.target] ?? rule.target}
                      <span className="text-muted-foreground ml-1 text-xs">
                        {rule.operator} {rule.threshold} / {formatWindowMs(rule.windowMs)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={SEVERITY_VARIANT[rule.severity] ?? "outline"}>
                        {rule.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={rule.enabled}
                        disabled={toggling === rule.id}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                          rule.enabled ? "bg-primary" : "bg-input"
                        }`}
                        onClick={() => handleToggle(rule)}
                      >
                        <span
                          className={`pointer-events-none block size-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                            rule.enabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {rule.lastFiredAt
                        ? new Date(rule.lastFiredAt).toLocaleString("zh-CN")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(rule)}
                        >
                          <Trash2 className="text-destructive size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      {activeTab === "history" && (
        <>
          {initialHistory.length === 0 ? (
            <p className="text-muted-foreground py-20 text-center text-sm">
              暂无触发历史
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>规则名称</TableHead>
                  <TableHead>级别</TableHead>
                  <TableHead>触发值</TableHead>
                  <TableHead>阈值</TableHead>
                  <TableHead>触发时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialHistory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm font-medium">
                      {item.ruleName}
                    </TableCell>
                    <TableCell>
                      <Badge variant={SEVERITY_VARIANT[item.severity] ?? "outline"}>
                        {item.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{item.value}</TableCell>
                    <TableCell className="text-sm">{item.threshold}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(item.firedAt).toLocaleString("zh-CN")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      <CreateAlertDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        onCreated={refresh}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="删除告警规则"
        description="删除后此规则将停止监控，已触发的历史记录将保留。"
        confirmLabel="删除"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
