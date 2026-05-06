import { Logger } from "@nestjs/common";
import type { NotificationPayload, NotificationProvider } from "./types.js";

/**
 * 企业微信机器人 Webhook Provider
 *
 * config 格式: { webhookUrl: string }
 */
export class WecomProvider implements NotificationProvider {
  public readonly type = "wecom";
  private readonly logger = new Logger(WecomProvider.name);

  public async send(
    config: Record<string, unknown>,
    payload: NotificationPayload,
  ): Promise<boolean> {
    const webhookUrl = config.webhookUrl as string | undefined;
    if (!webhookUrl) {
      this.logger.warn("企业微信渠道缺少 webhookUrl 配置，跳过发送");
      return false;
    }

    const content = `## ${payload.title}\n\n` +
      `> 严重级别: ${payload.severity}\n\n` +
      `${payload.content}` +
      (payload.url ? `\n\n[查看详情](${payload.url})` : "");

    const body = {
      msgtype: "markdown",
      markdown: { content },
    };

    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        this.logger.error(`企业微信发送失败: status=${resp.status} body=${await resp.text()}`);
        return false;
      }

      this.logger.log(`企业微信通知已发送: title="${payload.title}"`);
      return true;
    } catch (err) {
      this.logger.error(`企业微信请求异常: ${(err as Error).message}`);
      return false;
    }
  }
}
