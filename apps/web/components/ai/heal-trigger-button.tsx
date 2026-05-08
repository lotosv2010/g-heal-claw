"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { httpPost } from "@/lib/api/http";

interface HealTriggerButtonProps {
  readonly projectId: string;
  readonly issueId: string;
}

/**
 * 自动修复触发按钮
 *
 * 在 AI 诊断建议中出现时，用户可一键触发 HealModule 自动修复流程（生成 PR）。
 */
export function HealTriggerButton({ projectId, issueId }: HealTriggerButtonProps) {
  const [loading, setLoading] = useState(false);
  const [triggered, setTriggered] = useState(false);

  const handleTrigger = async () => {
    setLoading(true);
    try {
      await httpPost(`/api/v1/projects/${projectId}/issues/${issueId}/heal`, {
        repoUrl: "",
        branch: "main",
      });
      toast.success("自动修复已触发，请在 Heal 任务中心查看进度");
      setTriggered(true);
    } catch (err) {
      toast.error((err as Error).message || "触发失败");
    } finally {
      setLoading(false);
    }
  };

  if (triggered) {
    return (
      <Button variant="outline" size="sm" disabled className="mt-2">
        <Wrench className="mr-1 size-3" />
        已触发修复
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleTrigger} disabled={loading} className="mt-2">
      <Wrench className="mr-1 size-3" />
      {loading ? "触发中..." : "触发自动修复"}
    </Button>
  );
}
