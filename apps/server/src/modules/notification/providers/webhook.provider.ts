import { Logger } from "@nestjs/common";
import type { NotificationPayload, NotificationProvider } from "./types.js";

/**
 * 通用 Webhook Provider
 *
 * config 格式: { url: string, method?: string, headers?: Record<string, string> }
 */
export class WebhookProvider implements NotificationProvider {
  public readonly type = "webhook";
  private readonly logger = new Logger(WebhookProvider.name);

  public async send(
    config: Record<string, unknown>,
    payload: NotificationPayload,
  ): Promise<boolean> {
    const url = config.url as string | undefined;
    if (!url) {
      this.logger.warn("Webhook 渠道缺少 url 配置，跳过发送");
      return false;
    }

    const method = ((config.method as string) ?? "POST").toUpperCase();
    const customHeaders = (config.headers as Record<string, string>) ?? {};

    const body = {
      title: payload.title,
      content: payload.content,
      severity: payload.severity,
      url: payload.url,
    };

    try {
      const resp = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...customHeaders,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        this.logger.error(`Webhook 发送失败: url=${url} status=${resp.status}`);
        return false;
      }

      this.logger.log(`Webhook 通知已发送: url=${url} method=${method}`);
      return true;
    } catch (err) {
      this.logger.error(`Webhook 请求异常: url=${url} error=${(err as Error).message}`);
      return false;
    }
  }
}
