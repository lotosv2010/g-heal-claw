"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pencil, Trash2 } from "lucide-react";
import type { Project } from "@/lib/api/projects";

interface ProjectCardProps {
  readonly project: Project;
  readonly onEdit: (project: Project) => void;
  readonly onDelete: (project: Project) => void;
}

export function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
  return (
    <Card className="flex items-center justify-between p-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{project.name}</span>
          <Badge variant="secondary" className="text-xs">
            {project.slug}
          </Badge>
          {project.platform && (
            <Badge variant="outline" className="text-xs">
              {project.platform}
            </Badge>
          )}
        </div>
        <span className="text-muted-foreground text-xs">
          创建于 {new Date(project.createdAt).toLocaleDateString("zh-CN")}
          {" · "}
          数据保留 {project.retentionDays} 天
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => onEdit(project)}>
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(project)}>
          <Trash2 className="text-destructive size-4" />
        </Button>
      </div>
    </Card>
  );
}
