/**
 * 通知 Provider 接口定义
 */

export interface NotificationPayload {
  readonly title: string;
  readonly content: string;
  readonly severity: string;
  readonly url?: string;
}

export interface NotificationProvider {
  readonly type: string;
  send(
    config: Record<string, unknown>,
    payload: NotificationPayload,
  ): Promise<boolean>;
}
