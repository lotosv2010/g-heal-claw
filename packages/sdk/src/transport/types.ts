import type { SdkEvent } from "@g-heal-claw/shared";

/**
 * Transport 抽象：负责把一个或多个事件投递到 Gateway
 *
 * 骨架阶段只有单事件发送；批量 / 降级 / IDB 兜底留给 T1.2.5 / T1.2.6。
 */
export interface Transport {
  readonly name: string;
  /** 发送事件；成功返回 true，失败返回 false（永不抛错） */
  send(event: SdkEvent): Promise<boolean>;
  /** flush 剩余队列，骨架阶段直接 resolve(true) */
  flush(timeoutMs?: number): Promise<boolean>;
}
