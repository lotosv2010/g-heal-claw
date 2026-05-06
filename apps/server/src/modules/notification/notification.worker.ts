import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { QueueName } from "@g-heal-claw/shared";
import type { Job } from "bullmq";
import { ChannelService, type ChannelRow } from "./channel.service.js";
import { getProvider, renderTemplate } from "./providers/index.js";
import type { NotificationPayload } from "./providers/types.js";

/**
 * 通知任务载荷结构
 */
interface NotificationJobData {
  readonly historyId: string;
  readonly ruleId: string;
  readonly projectId: string;
  readonly channels: readonly string[];
  readonly templateVars: Record<string, string>;
}

/** 默认通知模板 */
const DEFAULT_TEMPLATE = `【{{severity}}】{{ruleName}}\n\n项目: {{projectId}}\n规则: {{ruleName}}\n触发时间: {{triggeredAt}}\n\n{{detail}}`;

/**
 * NotificationWorker（ADR-0035 T4.2.1 + T4.2.2）
 *
 * 消费通知队列，按渠道 ID 查询配置后通过对应 Provider 实际分发。
 */
@Processor(QueueName.Notifications)
export class NotificationWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationWorker.name);

  public constructor(private readonly channelService: ChannelService) {
    super();
  }

  public async process(job: Job<NotificationJobData>): Promise<{ sent: number }> {
    const { channels: channelIds, templateVars, historyId } = job.data;

    if (channelIds.length === 0) {
      this.logger.warn(`通知 job=${job.id} 无渠道配置，跳过`);
      return { sent: 0 };
    }

    // 批量获取渠道配置
    const channels = await this.channelService.getChannelsByIds(channelIds);

    let sent = 0;
    for (const channel of channels) {
      try {
        await this.sendToChannel(channel, templateVars);
        sent++;
      } catch (err) {
        this.logger.error(
          `通知发送失败: channel=${channel.id} type=${channel.type} error=${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `通知分发完成: history=${historyId} job=${job.id} sent=${sent}/${channels.length}`,
    );
    return { sent };
  }

  /**
   * 通过对应 Provider 发送通知到指定渠道
   */
  private async sendToChannel(
    channel: ChannelRow,
    templateVars: Record<string, string>,
  ): Promise<void> {
    const provider = getProvider(channel.type);
    if (!provider) {
      this.logger.warn(
        `未找到渠道 Provider: type=${channel.type} channel=${channel.id}`,
      );
      return;
    }

    // 构建通知载荷
    const title = renderTemplate(
      templateVars.title ?? "【{{severity}}】{{ruleName}}",
      templateVars,
    );
    const content = renderTemplate(
      templateVars.template ?? DEFAULT_TEMPLATE,
      templateVars,
    );

    const payload: NotificationPayload = {
      title,
      content,
      severity: templateVars.severity ?? "unknown",
      url: templateVars.url,
    };

    const success = await provider.send(channel.config, payload);
    if (!success) {
      throw new Error(
        `Provider ${channel.type} 返回失败: channel=${channel.id}`,
      );
    }
  }
}
