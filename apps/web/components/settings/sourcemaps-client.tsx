"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "./confirm-dialog";
import {
  deleteRelease,
  listArtifacts,
  type Artifact,
  type Release,
} from "@/lib/api/sourcemaps";

interface SourcemapsClientProps {
  readonly projectId: string;
  readonly initialReleases: readonly Release[];
}

export function SourcemapsClient({ projectId, initialReleases }: SourcemapsClientProps) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [artifacts, setArtifacts] = React.useState<readonly Artifact[]>([]);
  const [loadingArtifacts, setLoadingArtifacts] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Release | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const refresh = () => router.refresh();

  const toggleExpand = async (releaseId: string) => {
    if (expanded === releaseId) {
      setExpanded(null);
      setArtifacts([]);
      return;
    }
    setExpanded(releaseId);
    setLoadingArtifacts(true);
    try {
      const result = await listArtifacts(projectId, releaseId);
      setArtifacts(result.data);
    } catch {
      setArtifacts([]);
    } finally {
      setLoadingArtifacts(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRelease(projectId, deleteTarget.id);
      setDeleteTarget(null);
      if (expanded === deleteTarget.id) {
        setExpanded(null);
        setArtifacts([]);
      }
      refresh();
    } catch {
      // 静默
    } finally {
      setDeleting(false);
    }
  };

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="text-lg font-semibold">Source Map</h1>
        <p className="text-muted-foreground text-sm">
          通过 CLI 或 CI 上传 Sourcemap 后，异常堆栈将自动还原为源码位置。
        </p>
      </div>

      {initialReleases.length === 0 ? (
        <p className="text-muted-foreground py-20 text-center text-sm">
          暂无 Release，请通过 API 或 CLI 上传
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {initialReleases.map((r) => (
            <div key={r.id} className="rounded-lg border">
              <div className="flex items-center justify-between p-3">
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm font-medium"
                  onClick={() => toggleExpand(r.id)}
                >
                  {expanded === r.id ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  <span className="font-mono">{r.version}</span>
                  {r.commitSha && (
                    <Badge variant="outline" className="font-mono text-xs">
                      {r.commitSha.slice(0, 7)}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {r.artifactCount} 文件
                  </Badge>
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    {new Date(r.createdAt).toLocaleDateString("zh-CN")}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(r)}
                  >
                    <Trash2 className="text-destructive size-4" />
                  </Button>
                </div>
              </div>

              {expanded === r.id && (
                <div className="border-t px-3 pb-3 pt-2">
                  {loadingArtifacts ? (
                    <p className="text-muted-foreground text-xs">加载中...</p>
                  ) : artifacts.length === 0 ? (
                    <p className="text-muted-foreground text-xs">无 Artifact 文件</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>文件名</TableHead>
                          <TableHead>Map 文件名</TableHead>
                          <TableHead>大小</TableHead>
                          <TableHead>上传时间</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {artifacts.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="font-mono text-xs">{a.filename}</TableCell>
                            <TableCell className="font-mono text-xs">{a.mapFilename}</TableCell>
                            <TableCell className="text-xs">{formatSize(a.fileSize)}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {new Date(a.createdAt).toLocaleDateString("zh-CN")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="删除 Release"
        description={`确定删除 Release「${deleteTarget?.version ?? ""}」？所有关联的 Sourcemap 文件将被永久删除。`}
        confirmLabel="删除"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
