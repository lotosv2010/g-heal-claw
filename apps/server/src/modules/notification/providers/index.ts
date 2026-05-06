import type { NotificationProvider } from "./types.js";
import { EmailProvider } from "./email.provider.js";
import { DingtalkProvider } from "./dingtalk.provider.js";
import { WecomProvider } from "./wecom.provider.js";
import { SlackProvider } from "./slack.provider.js";
import { WebhookProvider } from "./webhook.provider.js";

export type { NotificationPayload, NotificationProvider } from "./types.js";
export { renderTemplate } from "./template.js";

/**
 * Provider 注册表（按 type 字段索引）
 */
const providers: readonly NotificationProvider[] = [
  new EmailProvider(),
  new DingtalkProvider(),
  new WecomProvider(),
  new SlackProvider(),
  new WebhookProvider(),
];

const providerMap = new Map<string, NotificationProvider>(
  providers.map((p) => [p.type, p]),
);

/**
 * 根据渠道 type 获取对应的 Provider 实例
 */
export function getProvider(type: string): NotificationProvider | null {
  return providerMap.get(type) ?? null;
}
