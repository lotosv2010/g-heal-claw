"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectCard } from "./project-card";
import { CreateProjectDialog } from "./create-project-dialog";
import { EditProjectDialog } from "./edit-project-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { deleteProject, type Project } from "@/lib/api/projects";

interface ProjectsClientProps {
  readonly initialProjects: readonly Project[];
}

const PLATFORM_TABS = [
  { key: "all", label: "全部" },
  { key: "web", label: "Web" },
  { key: "h5", label: "H5" },
  { key: "miniapp", label: "小程序" },
  { key: "native", label: "原生 APP" },
  { key: "nodejs", label: "Node.js" },
  { key: "other", label: "其他" },
] as const;

export function ProjectsClient({ initialProjects }: ProjectsClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editProject, setEditProject] = React.useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Project | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [activeTab, setActiveTab] = React.useState("all");

  const refresh = () => router.refresh();

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      refresh();
    } catch {
    } finally {
      setDeleting(false);
    }
  };

  const filtered = initialProjects.filter((p) => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase());
    const matchTab = activeTab === "all" || p.platform === activeTab;
    return matchSearch && matchTab;
  });

  const counts = React.useMemo(() => {
    const map: Record<string, number> = { all: initialProjects.length };
    for (const p of initialProjects) {
      const key = p.platform ?? "other";
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [initialProjects]);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">应用管理</h1>
          <p className="text-muted-foreground text-xs mt-1">管理监控项目，获取 DSN 接入 SDK</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          创建项目
        </Button>
      </div>

      {/* 搜索 + 分类 */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索项目名称、标识或 ID..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {PLATFORM_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {counts[tab.key] ? ` (${counts[tab.key]})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* 项目列表 */}
      {filtered.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-20 text-center">
          <p className="text-sm">{initialProjects.length === 0 ? "暂无项目" : "无匹配结果"}</p>
          {initialProjects.length === 0 && (
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              创建第一个项目
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((p) => (
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
        description={`确定删除项目「${deleteTarget?.name ?? ""}」？此操作不可恢复，所有相关数据将被清除。`}
        confirmLabel="删除"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
