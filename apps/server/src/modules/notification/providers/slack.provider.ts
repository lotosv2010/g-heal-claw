import { Logger } from "@nestjs/common";
import type { NotificationPayload, NotificationProvider } from "./types.js";

/**
 * Slack Incoming Webhook Provider
 *
 * config 格式: { webhookUrl: string }
 */
export class SlackProvider implements NotificationProvider {
  public readonly type = "slack";
  private readonly logger = new Logger(SlackProvider.name);

  public async send(
    config: Record<string, unknown>,
    payload: NotificationPayload,
  ): Promise<boolean> {
    const webhookUrl = config.webhookUrl as string | undefined;
    if (!webhookUrl) {
      this.logger.warn("Slack 渠道缺少 webhookUrl 配置，跳过发送");
      return false;
    }

    const markdownContent = `*[${payload.severity.toUpperCase()}]* ${payload.content}` +
      (payload.url ? `\n<${payload.url}|查看详情>` : "");

    const body = {
      text: payload.title,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: markdownContent,
          },
        },
      ],
    };

    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        this.logger.error(`Slack 发送失败: status=${resp.status} body=${await resp.text()}`);
        return false;
      }

      this.logger.log(`Slack 通知已发送: title="${payload.title}"`);
      return true;
    } catch (err) {
      this.logger.error(`Slack 请求异常: ${(err as Error).message}`);
      return false;
    }
  }
}
