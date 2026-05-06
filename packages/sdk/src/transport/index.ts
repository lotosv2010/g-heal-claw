import type { SdkEvent } from "@g-heal-claw/shared";
import type { Logger } from "../logger.js";
import type { Transport } from "./types.js";
import { createEventQueue } from "./queue.js";
import { createSender } from "./sender.js";
import { createPersistence } from "./persistence.js";

/**
 * 生产级 Transport 工厂（ADR-0034）
 *
 * 组装：EventQueue + Sender + Persistence
 *  - enqueue → 内存 buffer → flush → sender.sendBatch
 *  - 发送失败 → persistence.store → 启动/online 重试
 */

export interface TransportOptions {
  readonly endpoint: string;
  readonly beaconEndpoint: string;
  readonly dsn: string;
  readonly logger: Logger;
  readonly maxBatchSize: number;
  readonly flushIntervalMs: number;
  readonly preferredChannel: "beacon" | "fetch" | "image" | "auto";
}

export function createTransport(opts: TransportOptions): Transport {
  const { logger } = opts;
  const persistence = createPersistence();

  const sender = createSender({
    endpoint: opts.endpoint,
    beaconEndpoint: opts.beaconEndpoint,
    dsn: opts.dsn,
    logger,
    preferredChannel: opts.preferredChannel,
  });

  const queue = createEventQueue({
    maxBatchSize: opts.maxBatchSize,
    flushIntervalMs: opts.flushIntervalMs,
    onFlush: async (events: SdkEvent[]) => {
      const ok = await sender.sendBatch(events);
      if (!ok) {
        logger.debug("transport: 发送失败，写入 IndexedDB 待重试");
        await persistence.store(events).catch(() => {});
      }
    },
  });

  // 启动时重试 IndexedDB 中的待发批次
  retryPending(sender, persistence, logger);

  // online 事件重试
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      retryPending(sender, persistence, logger);
    });
  }

  return {
    name: "batch-transport",
    async send(event: SdkEvent): Promise<boolean> {
      queue.enqueue(event);
      return true;
    },
    async flush(timeoutMs?: number): Promise<boolean> {
      queue.flush();
      // 简单等待：给异步 onFlush 一个执行窗口
      await new Promise((r) => setTimeout(r, Math.min(timeoutMs ?? 1000, 5000)));
      return true;
    },
  };
}

async function retryPending(
  sender: ReturnType<typeof createSender>,
  persistence: ReturnType<typeof createPersistence>,
  logger: Logger,
): Promise<void> {
  if (!persistence.isAvailable()) return;
  try {
    const batches = await persistence.readAll();
    for (const batch of batches) {
      const ok = await sender.sendBatch(batch.events);
      if (ok) {
        await persistence.remove(batch.id);
      } else {
        await persistence.incrementRetry(batch.id);
      }
    }
  } catch (err) {
    logger.debug("transport: retry 异常", err);
  }
}

export { createFetchTransport } from "./fetch.js";
