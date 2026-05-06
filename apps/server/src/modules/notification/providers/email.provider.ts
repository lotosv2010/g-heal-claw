import { Logger } from "@nestjs/common";
import type { NotificationPayload, NotificationProvider } from "./types.js";

/**
 * 邮件通知 Provider（MVP 占位实现）
 *
 * 当前仅日志输出邮件载荷，后续接入 SMTP 服务或邮件 API。
 * config 格式: { to: string, from?: string, smtpHost?: string }
 */
export class EmailProvider implements NotificationProvider {
  public readonly type = "email";
  private readonly logger = new Logger(EmailProvider.name);

  public async send(
    config: Record<string, unknown>,
    payload: NotificationPayload,
  ): Promise<boolean> {
    const to = config.to as string | undefined;
    if (!to) {
      this.logger.warn("邮件渠道缺少 to 配置，跳过发送");
      return false;
    }

    const from = (config.from as string) ?? "noreply@g-heal-claw.io";

    // MVP: 日志输出，后续替换为实际 SMTP 发送
    this.logger.log(
      `[Email] to=${to} from=${from} subject="${payload.title}" severity=${payload.severity}`,
    );
    this.logger.debug(
      `[Email] content: ${payload.content.slice(0, 200)}`,
    );

    return true;
  }
}
