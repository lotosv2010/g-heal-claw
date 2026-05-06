"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createChannel, type ChannelType } from "@/lib/api/channels";

interface CreateChannelDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly projectId: string;
  readonly onCreated: () => void;
}

const CHANNEL_TYPES = [
  { value: "email", label: "邮件" },
  { value: "dingtalk", label: "钉钉" },
  { value: "wecom", label: "企业微信" },
  { value: "slack", label: "Slack" },
  { value: "webhook", label: "Webhook" },
] as const;

const WEBHOOK_METHODS = [
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
] as const;

export function CreateChannelDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: CreateChannelDialogProps) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<ChannelType | "">("");
  const [creating, setCreating] = React.useState(false);

  // 动态配置字段
  const [emailTo, setEmailTo] = React.useState("");
  const [webhookUrl, setWebhookUrl] = React.useState("");
  const [dingtalkSecret, setDingtalkSecret] = React.useState("");
  const [customUrl, setCustomUrl] = React.useState("");
  const [customMethod, setCustomMethod] = React.useState<"POST" | "PUT">("POST");

  const resetForm = () => {
    setName("");
    setType("");
    setEmailTo("");
    setWebhookUrl("");
    setDingtalkSecret("");
    setCustomUrl("");
    setCustomMethod("POST");
  };

  const canSubmit = (): boolean => {
    if (!name.trim() || !type) return false;
    switch (type) {
      case "email":
        return emailTo.trim() !== "";
      case "dingtalk":
      case "wecom":
      case "slack":
        return webhookUrl.trim() !== "";
      case "webhook":
        return customUrl.trim() !== "";
      default:
        return false;
    }
  };

  const buildConfig = () => {
    switch (type) {
      case "email":
        return { to: emailTo.trim() };
      case "dingtalk":
        return {
          webhookUrl: webhookUrl.trim(),
          ...(dingtalkSecret.trim() ? { secret: dingtalkSecret.trim() } : {}),
        };
      case "wecom":
      case "slack":
        return { webhookUrl: webhookUrl.trim() };
      case "webhook":
        return { url: customUrl.trim(), method: customMethod };
      default:
        return {};
    }
  };

  const handleCreate = async () => {
    if (!canSubmit() || !type) return;
    setCreating(true);
    try {
      await createChannel(projectId, {
        name: name.trim(),
        type,
        config: buildConfig(),
      });
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch {
      // 静默
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>创建通知渠道</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {/* 名称 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="channel-name">渠道名称</Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：运维钉钉群"
            />
          </div>

          {/* 类型 */}
          <div className="flex flex-col gap-1.5">
            <Label>渠道类型</Label>
            <Select value={type} onValueChange={(v) => setType(v as ChannelType)}>
              <SelectTrigger>
                <SelectValue placeholder="选择渠道类型" />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_TYPES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 动态配置字段 */}
          {type === "email" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="channel-email-to">收件人邮箱</Label>
              <Input
                id="channel-email-to"
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="team@example.com"
              />
            </div>
          )}

          {type === "dingtalk" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="channel-dingtalk-url">Webhook URL</Label>
                <Input
                  id="channel-dingtalk-url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="channel-dingtalk-secret">签名密钥（可选）</Label>
                <Input
                  id="channel-dingtalk-secret"
                  value={dingtalkSecret}
                  onChange={(e) => setDingtalkSecret(e.target.value)}
                  placeholder="SEC..."
                />
              </div>
            </>
          )}

          {(type === "wecom" || type === "slack") && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="channel-webhook-url">Webhook URL</Label>
              <Input
                id="channel-webhook-url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder={
                  type === "wecom"
                    ? "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                    : "https://hooks.slack.com/services/..."
                }
              />
            </div>
          )}

          {type === "webhook" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="channel-custom-url">请求 URL</Label>
                <Input
                  id="channel-custom-url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://your-service.com/webhook"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>HTTP 方法</Label>
                <Select value={customMethod} onValueChange={(v) => setCustomMethod(v as "POST" | "PUT")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEBHOOK_METHODS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            取消
          </Button>
          <Button onClick={handleCreate} disabled={!canSubmit() || creating}>
            {creating ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
