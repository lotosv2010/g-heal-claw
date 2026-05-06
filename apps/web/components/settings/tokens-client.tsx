"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "./confirm-dialog";
import { createToken, deleteToken, type Token, type TokenCreated } from "@/lib/api/tokens";

interface TokensClientProps {
  readonly projectId: string;
  readonly initialTokens: readonly Token[];
}

export function TokensClient({ projectId, initialTokens }: TokensClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState<TokenCreated | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Token | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const refresh = () => router.refresh();

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createToken(projectId, { label: label.trim() || undefined });
      setCreated(result);
      setCreateOpen(false);
      setLabel("");
      refresh();
    } catch {
      // 静默
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.secretKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteToken(projectId, deleteTarget.id);
      setDeleteTarget(null);
      refresh();
    } catch {
      // 静默
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">API Keys</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          创建 Token
        </Button>
      </div>

      {initialTokens.length === 0 ? (
        <p className="text-muted-foreground py-20 text-center text-sm">
          暂无 API Token
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>标签</TableHead>
              <TableHead>Secret Key</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="w-20">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialTokens.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-sm">{t.label ?? "-"}</TableCell>
                <TableCell className="font-mono text-xs">{t.secretKeyMasked}</TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {new Date(t.createdAt).toLocaleDateString("zh-CN")}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(t)}
                  >
                    <Trash2 className="text-destructive size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* 创建对话框 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建 API Token</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="token-label">标签（可选）</Label>
              <Input
                id="token-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="用途说明"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 一次性展示 secretKey */}
      <Dialog open={created !== null} onOpenChange={(v) => { if (!v) setCreated(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token 已创建</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            请立即复制以下密钥，关闭后将无法再次查看。
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-muted flex-1 rounded px-3 py-2 font-mono text-xs break-all">
              {created?.secretKey}
            </code>
            <Button variant="outline" size="icon" onClick={handleCopy}>
              <Copy className="size-4" />
            </Button>
          </div>
          {copied && <p className="text-sm text-green-600">已复制</p>}
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="删除 Token"
        description="删除后使用此 Token 的所有服务将立即失效。"
        confirmLabel="删除"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
