import { createHmac } from "node:crypto";
import { Logger } from "@nestjs/common";
import type { NotificationPayload, NotificationProvider } from "./types.js";

/**
 * 钉钉机器人 Webhook Provider
 *
 * config 格式: { webhookUrl: string, secret?: string }
 * 当 secret 存在时，计算签名附加到 URL 参数中。
 */
export class DingtalkProvider implements NotificationProvider {
  public readonly type = "dingtalk";
  private readonly logger = new Logger(DingtalkProvider.name);

  public async send(
    config: Record<string, unknown>,
    payload: NotificationPayload,
  ): Promise<boolean> {
    const webhookUrl = config.webhookUrl as string | undefined;
    if (!webhookUrl) {
      this.logger.warn("钉钉渠道缺少 webhookUrl 配置，跳过发送");
      return false;
    }

    let url = webhookUrl;

    // 签名计算（加签安全模式）
    if (config.secret) {
      const timestamp = Date.now();
      const stringToSign = `${timestamp}\n${config.secret as string}`;
      const sign = createHmac("sha256", config.secret as string)
        .update(stringToSign)
        .digest("base64");
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
    }

    const text = `## ${payload.title}\n\n` +
      `**严重级别**: ${payload.severity}\n\n` +
      `${payload.content}` +
      (payload.url ? `\n\n[查看详情](${payload.url})` : "");

    const body = {
      msgtype: "markdown",
      markdown: { title: payload.title, text },
    };

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        this.logger.error(`钉钉发送失败: status=${resp.status} body=${await resp.text()}`);
        return false;
      }

      this.logger.log(`钉钉通知已发送: title="${payload.title}"`);
      return true;
    } catch (err) {
      this.logger.error(`钉钉请求异常: ${(err as Error).message}`);
      return false;
    }
  }
}
