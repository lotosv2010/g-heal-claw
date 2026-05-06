"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAlertRule } from "@/lib/api/alerts";

interface CreateAlertDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly projectId: string;
  readonly onCreated: () => void;
}

const TARGET_OPTIONS = [
  { value: "error_rate", label: "错误率" },
  { value: "api_success_rate", label: "API 成功率" },
  { value: "web_vital", label: "Web Vital" },
  { value: "issue_count", label: "Issue 数量" },
  { value: "custom_metric", label: "自定义指标" },
] as const;

const OPERATOR_OPTIONS = [
  { value: "gt", label: "> 大于" },
  { value: "gte", label: ">= 大于等于" },
  { value: "lt", label: "< 小于" },
  { value: "lte", label: "<= 小于等于" },
  { value: "eq", label: "= 等于" },
] as const;

const WINDOW_OPTIONS = [
  { value: "300000", label: "5 分钟" },
  { value: "600000", label: "10 分钟" },
  { value: "1800000", label: "30 分钟" },
  { value: "3600000", label: "1 小时" },
] as const;

const SEVERITY_OPTIONS = [
  { value: "critical", label: "严重" },
  { value: "warning", label: "警告" },
  { value: "info", label: "信息" },
] as const;

const COOLDOWN_OPTIONS = [
  { value: "300000", label: "5 分钟" },
  { value: "600000", label: "10 分钟" },
  { value: "1800000", label: "30 分钟" },
  { value: "3600000", label: "1 小时" },
] as const;

export function CreateAlertDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: CreateAlertDialogProps) {
  const [name, setName] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [operator, setOperator] = React.useState("");
  const [threshold, setThreshold] = React.useState("");
  const [windowMs, setWindowMs] = React.useState("");
  const [severity, setSeverity] = React.useState("");
  const [cooldownMs, setCooldownMs] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const resetForm = () => {
    setName("");
    setTarget("");
    setOperator("");
    setThreshold("");
    setWindowMs("");
    setSeverity("");
    setCooldownMs("");
  };

  const canSubmit =
    name.trim() !== "" &&
    target !== "" &&
    operator !== "" &&
    threshold !== "" &&
    windowMs !== "" &&
    severity !== "" &&
    cooldownMs !== "";

  const handleCreate = async () => {
    if (!canSubmit) return;
    setCreating(true);
    try {
      await createAlertRule(projectId, {
        name: name.trim(),
        target,
        operator,
        threshold: Number(threshold),
        windowMs: Number(windowMs),
        severity,
        cooldownMs: Number(cooldownMs),
      });
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch {
      // 静默
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>创建告警规则</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {/* 名称 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="alert-name">规则名称</Label>
            <Input
              id="alert-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：错误率超标告警"
            />
          </div>

          {/* 监控目标 */}
          <div className="flex flex-col gap-1.5">
            <Label>监控目标</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue placeholder="选择监控目标" />
              </SelectTrigger>
              <SelectContent>
                {TARGET_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 运算符 + 阈值 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>运算符</Label>
              <Select value={operator} onValueChange={setOperator}>
                <SelectTrigger>
                  <SelectValue placeholder="选择" />
                </SelectTrigger>
                <SelectContent>
                  {OPERATOR_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alert-threshold">阈值</Label>
              <Input
                id="alert-threshold"
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder="数值"
              />
            </div>
          </div>

          {/* 时间窗口 */}
          <div className="flex flex-col gap-1.5">
            <Label>时间窗口</Label>
            <Select value={windowMs} onValueChange={setWindowMs}>
              <SelectTrigger>
                <SelectValue placeholder="选择时间窗口" />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 严重级别 */}
          <div className="flex flex-col gap-1.5">
            <Label>严重级别</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue placeholder="选择级别" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 冷却时间 */}
          <div className="flex flex-col gap-1.5">
            <Label>冷却时间</Label>
            <Select value={cooldownMs} onValueChange={setCooldownMs}>
              <SelectTrigger>
                <SelectValue placeholder="选择冷却时间" />
              </SelectTrigger>
              <SelectContent>
                {COOLDOWN_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            取消
          </Button>
          <Button onClick={handleCreate} disabled={!canSubmit || creating}>
            {creating ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
