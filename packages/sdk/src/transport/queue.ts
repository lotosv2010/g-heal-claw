import type { SdkEvent } from "@g-heal-claw/shared";

/**
 * 事件队列：内存 buffer + flush 触发（ADR-0034 T1.2.5.1）
 *
 * flush 时机：
 *  - buffer.length >= maxBatchSize
 *  - flushInterval 到期
 *  - 外部主动 flush()（pagehide / 用户调用）
 */

export interface QueueOptions {
  readonly maxBatchSize: number;
  readonly flushIntervalMs: number;
  readonly onFlush: (events: SdkEvent[]) => void;
}

export interface EventQueue {
  enqueue(event: SdkEvent): void;
  flush(): void;
  size(): number;
  destroy(): void;
}

export function createEventQueue(opts: QueueOptions): EventQueue {
  const { maxBatchSize, flushIntervalMs, onFlush } = opts;
  let buffer: SdkEvent[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  const doFlush = (): void => {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    onFlush(batch);
  };

  // 周期 flush
  if (flushIntervalMs > 0) {
    timer = setInterval(doFlush, flushIntervalMs);
  }

  // pagehide / visibilitychange 兜底
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", doFlush, { once: false });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") doFlush();
    });
  }

  return {
    enqueue(event: SdkEvent): void {
      buffer.push(event);
      if (buffer.length >= maxBatchSize) {
        doFlush();
      }
    },
    flush(): void {
      doFlush();
    },
    size(): number {
      return buffer.length;
    },
    destroy(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      doFlush();
    },
  };
}
