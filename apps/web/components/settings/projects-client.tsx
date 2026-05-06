"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "./project-card";
import { CreateProjectDialog } from "./create-project-dialog";
import { EditProjectDialog } from "./edit-project-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { deleteProject, type Project } from "@/lib/api/projects";

interface ProjectsClientProps {
  readonly initialProjects: readonly Project[];
}

export function ProjectsClient({ initialProjects }: ProjectsClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editProject, setEditProject] = React.useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Project | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const refresh = () => router.refresh();

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      refresh();
    } catch {
      // 静默处理，用户可重试
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">应用管理</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          创建项目
        </Button>
      </div>

      {initialProjects.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-20 text-center">
          <p className="text-sm">暂无项目</p>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            创建第一个项目
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {initialProjects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onEdit={setEditProject}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={refresh} />
      <EditProjectDialog
        project={editProject}
        open={editProject !== null}
        onOpenChange={(v) => { if (!v) setEditProject(null); }}
        onSuccess={refresh}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="删除项目"
        description={`确定删除项目「${deleteTarget?.name ?? ""}」？此操作不可恢复。`}
        confirmLabel="删除"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
