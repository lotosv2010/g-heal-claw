"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { triggerHeal, getAiConfig } from "@/lib/api/heal";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";

interface HealTriggerButtonProps {
  readonly projectId: string;
  readonly issueId: string;
}

export function HealTriggerButton({ projectId, issueId }: HealTriggerButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [triggered, setTriggered] = useState(false);

  const config = getAiConfig(projectId);
  const hasConfig = !!config?.repoUrl;

  const handleTrigger = async () => {
    if (!config?.repoUrl) {
      toast.error("请先在 设置 → AI 修复配置 中配置仓库地址");
      return;
    }
    setLoading(true);
    try {
      await triggerHeal(projectId, issueId, config.repoUrl, config.branch || "main", { basePath: config.basePath });
      toast.success("自动修复已触发，正在跳转到任务列表...");
      setTriggered(true);
      router.push("/settings/ai");
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

  if (!hasConfig) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" disabled className="mt-2 opacity-50">
            <Wrench className="mr-1 size-3" />
            触发自动修复
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">请先在 设置 → AI 修复配置 中配置仓库地址</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleTrigger} disabled={loading} className="mt-2">
      <Wrench className="mr-1 size-3" />
      {loading ? "触发中..." : "触发自动修复"}
    </Button>
  );
}
