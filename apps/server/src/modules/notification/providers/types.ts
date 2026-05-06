/**
 * 通知 Provider 接口定义（T4.2.2）
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
