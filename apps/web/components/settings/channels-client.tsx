"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "./confirm-dialog";
import { CreateChannelDialog } from "./create-channel-dialog";
import {
  deleteChannel,
  testChannel,
  type Channel,
} from "@/lib/api/channels";

interface ChannelsClientProps {
  readonly projectId: string;
  readonly initialChannels: readonly Channel[];
}

const TYPE_LABELS: Record<string, string> = {
  email: "邮件",
  dingtalk: "钉钉",
  wecom: "企业微信",
  slack: "Slack",
  webhook: "Webhook",
};

const TYPE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  email: "default",
  dingtalk: "secondary",
  wecom: "secondary",
  slack: "outline",
  webhook: "outline",
};

export function ChannelsClient({ projectId, initialChannels }: ChannelsClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Channel | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [testing, setTesting] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<{ id: string; success: boolean } | null>(null);

  const refresh = () => router.refresh();

  const handleTest = async (channel: Channel) => {
    setTesting(channel.id);
    setTestResult(null);
    try {
      await testChannel(projectId, channel.id);
      setTestResult({ id: channel.id, success: true });
    } catch {
      setTestResult({ id: channel.id, success: false });
    } finally {
      setTesting(null);
      // 3 秒后清除结果提示
      setTimeout(() => setTestResult(null), 3000);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteChannel(projectId, deleteTarget.id);
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
        <h1 className="text-lg font-semibold">通知渠道</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          创建渠道
        </Button>
      </div>

      {initialChannels.length === 0 ? (
        <p className="text-muted-foreground py-20 text-center text-sm">
          暂无通知渠道
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>启用</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="w-32">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialChannels.map((channel) => (
              <TableRow key={channel.id}>
                <TableCell className="text-sm font-medium">{channel.name}</TableCell>
                <TableCell>
                  <Badge variant={TYPE_VARIANT[channel.type] ?? "outline"}>
                    {TYPE_LABELS[channel.type] ?? channel.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-block size-2 rounded-full ${
                      channel.enabled ? "bg-green-500" : "bg-gray-300"
                    }`}
                  />
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    {channel.enabled ? "已启用" : "已禁用"}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {new Date(channel.createdAt).toLocaleDateString("zh-CN")}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={testing === channel.id}
                      onClick={() => handleTest(channel)}
                      title="测试发送"
                    >
                      <Send className="size-4" />
                    </Button>
                    {testResult?.id === channel.id && (
                      <span
                        className={`text-xs ${
                          testResult.success ? "text-green-600" : "text-destructive"
                        }`}
                      >
                        {testResult.success ? "成功" : "失败"}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(channel)}
                    >
                      <Trash2 className="text-destructive size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CreateChannelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        onCreated={refresh}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="删除通知渠道"
        description="删除后此渠道将停止接收告警通知。"
        confirmLabel="删除"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
