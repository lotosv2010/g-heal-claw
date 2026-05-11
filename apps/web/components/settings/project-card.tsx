"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Copy, Pencil, Trash2, Globe, Smartphone, AppWindow, Server, Box } from "lucide-react";
import type { Project } from "@/lib/api/projects";

interface ProjectCardProps {
  readonly project: Project;
  readonly onEdit: (project: Project) => void;
  readonly onDelete: (project: Project) => void;
}

const PLATFORM_CONFIG: Record<string, { label: string; icon: typeof Globe; color: string }> = {
  web: { label: "Web", icon: Globe, color: "text-blue-500" },
  h5: { label: "H5", icon: Smartphone, color: "text-purple-500" },
  miniapp: { label: "小程序", icon: AppWindow, color: "text-green-500" },
  native: { label: "原生 APP", icon: Smartphone, color: "text-orange-500" },
  nodejs: { label: "Node.js", icon: Server, color: "text-emerald-500" },
  other: { label: "其他", icon: Box, color: "text-zinc-500" },
};

export function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
  const [copied, setCopied] = useState(false);
  const platform = PLATFORM_CONFIG[project.platform ?? "other"] ?? PLATFORM_CONFIG.other;
  const PlatformIcon = platform.icon;

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(project.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="group relative overflow-hidden p-0 transition-shadow hover:shadow-md">
      {/* 左侧平台色条 */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${platform.color.replace("text-", "bg-")}`} />

      <div className="flex items-center gap-4 py-4 pl-5 pr-4">
        {/* 平台图标 */}
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted ${platform.color}`}>
          <PlatformIcon className="size-5" />
        </div>

        {/* 信息区 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{project.name}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">{platform.label}</Badge>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-muted-foreground text-xs">
              <span className="opacity-60">ID:</span>{" "}
              <code className="font-mono text-[11px]">{project.id}</code>
            </span>
            <button
              onClick={handleCopyId}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="复制项目 ID"
            >
              <Copy className="size-3" />
            </button>
            {copied && <span className="text-[10px] text-green-500">已复制</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-muted-foreground text-[11px]">
            <span>slug: {project.slug}</span>
            <span>·</span>
            <span>保留 {project.retentionDays} 天</span>
            <span>·</span>
            <span>{new Date(project.createdAt).toLocaleDateString("zh-CN")}</span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => onEdit(project)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => onDelete(project)}>
            <Trash2 className="text-destructive size-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
