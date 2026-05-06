"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProject, type Project, type UpdateProjectInput } from "@/lib/api/projects";

const PLATFORMS = ["web", "h5", "miniapp", "nodejs", "other"] as const;

interface EditProjectDialogProps {
  readonly project: Project | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: () => void;
}

export function EditProjectDialog({
  project,
  open,
  onOpenChange,
  onSuccess,
}: EditProjectDialogProps) {
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [platform, setPlatform] = React.useState<string>("web");
  const [retentionDays, setRetentionDays] = React.useState("90");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (project) {
      setName(project.name);
      setSlug(project.slug);
      setPlatform(project.platform ?? "web");
      setRetentionDays(String(project.retentionDays));
      setError(null);
    }
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    if (!name.trim() || !slug.trim()) {
      setError("名称和标识不能为空");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const input: UpdateProjectInput = {
        name: name.trim(),
        slug: slug.trim(),
        platform,
        retentionDays: Number(retentionDays) || 90,
      };
      await updateProject(project.id, input);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑项目</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-name">项目名称</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-slug">项目标识（slug）</Label>
            <Input
              id="edit-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>平台</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-retention">数据保留天数</Label>
            <Input
              id="edit-retention"
              type="number"
              min={7}
              max={365}
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
