"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  createRelease,
  deleteRelease,
  listArtifacts,
  uploadArtifact,
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

  // 创建 Release 对话框
  const [showCreate, setShowCreate] = React.useState(false);
  const [createVersion, setCreateVersion] = React.useState("");
  const [createCommitSha, setCreateCommitSha] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  // 上传 Artifact
  const [uploadTarget, setUploadTarget] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const refresh = () => router.refresh();

  const handleCreate = async () => {
    if (!createVersion.trim()) return;
    setCreating(true);
    try {
      await createRelease(projectId, createVersion.trim(), createCommitSha.trim() || undefined);
      toast.success(`Release「${createVersion}」创建成功`);
      setShowCreate(false);
      setCreateVersion("");
      setCreateCommitSha("");
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const filename = file.name;
      await uploadArtifact(projectId, uploadTarget, filename, file, (percent) => {
        setUploadProgress(percent);
      });
      toast.success(`「${filename}」上传成功`);
      const result = await listArtifacts(projectId, uploadTarget);
      setArtifacts(result.data);
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
      if (expanded === deleteTarget.id) {
        setExpanded(null);
        setArtifacts([]);
      }
      toast.success(`Release「${deleteTarget.version}」已删除`);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      toast.error((err as Error).message || "删除失败");
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
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Source Map</h1>
          <p className="text-muted-foreground text-sm">
            上传 Sourcemap 后，异常堆栈将自动还原为源码位置。
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 size-4" />
          创建 Release
        </Button>
      </div>

      {initialReleases.length === 0 ? (
        <p className="text-muted-foreground py-20 text-center text-sm">
          暂无 Release，点击上方按钮创建
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
                  <div className="mb-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={uploading}
                      onClick={() => {
                        setUploadTarget(r.id);
                        fileInputRef.current?.click();
                      }}
                    >
                      <Upload className="mr-1 size-3" />
                      {uploading ? `上传中 ${uploadProgress}%` : "上传 .map 文件"}
                    </Button>
                    {uploading && (
                      <div className="ml-2 flex-1 max-w-32">
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-200"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  {loadingArtifacts ? (
                    <p className="text-muted-foreground text-xs">加载中...</p>
                  ) : artifacts.length === 0 ? (
                    <p className="text-muted-foreground text-xs">无 Artifact 文件，点击上方按钮上传</p>
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

      {/* 创建 Release 对话框 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建 Release</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="version">版本号</Label>
              <Input
                id="version"
                placeholder="如 1.0.0 或 commit hash"
                value={createVersion}
                onChange={(e) => setCreateVersion(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commitSha">Commit SHA（可选）</Label>
              <Input
                id="commitSha"
                placeholder="如 a1b2c3d"
                value={createCommitSha}
                onChange={(e) => setCreateCommitSha(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={creating || !createVersion.trim()}>
              {creating ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 隐藏的文件选择器 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".map,.js.map"
        className="hidden"
        onChange={handleUpload}
      />
    </>
  );
}
