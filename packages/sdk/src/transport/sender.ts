import type { SdkEvent } from "@g-heal-claw/shared";
import type { Logger } from "../logger.js";

/**
 * 多通道批量发送器（ADR-0034 T1.2.5.2）
 *
 * 降级链：beacon → fetch(keepalive) → image（单条 ≤ 2KB）
 * Beacon 单次 ≤ 64KB：超限自动拆批。
 */

const BEACON_MAX_BYTES = 64 * 1024;

export interface SenderOptions {
  readonly endpoint: string;
  readonly beaconEndpoint: string;
  readonly dsn: string;
  readonly logger: Logger;
  readonly preferredChannel: "beacon" | "fetch" | "image" | "auto";
}

export interface Sender {
  sendBatch(events: SdkEvent[]): Promise<boolean>;
}

export function createSender(opts: SenderOptions): Sender {
  const { endpoint, beaconEndpoint, dsn, logger, preferredChannel } = opts;

  function serialize(events: SdkEvent[]): string {
    return JSON.stringify({ dsn, sentAt: Date.now(), events });
  }

  function canBeacon(): boolean {
    return typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function";
  }

  function canFetch(): boolean {
    return typeof fetch !== "undefined";
  }

  // beacon 发送（拆批处理 64KB 限制）
  function sendViaBeacon(events: SdkEvent[]): boolean {
    const body = serialize(events);
    if (body.length <= BEACON_MAX_BYTES) {
      return navigator.sendBeacon(beaconEndpoint, body);
    }
    // 超限拆批
    const batches = splitBatches(events);
    let allOk = true;
    for (const batch of batches) {
      const ok = navigator.sendBeacon(beaconEndpoint, serialize(batch));
      if (!ok) allOk = false;
    }
    return allOk;
  }

  // fetch 发送
  async function sendViaFetch(events: SdkEvent[]): Promise<boolean> {
    try {
      const body = serialize(events);
      const res = await fetch(endpoint, {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body,
        mode: "cors",
      });
      return res.ok || res.status === 204;
    } catch {
      return false;
    }
  }

  // image 兜底（单条 ≤ 2KB，仅发送关键字段）
  function sendViaImage(events: SdkEvent[]): boolean {
    for (const event of events) {
      try {
        const payload = encodeURIComponent(JSON.stringify({ dsn, events: [event] }));
        if (payload.length > 2048) continue;
        const img = new Image();
        img.src = `${endpoint}?payload=${payload}`;
      } catch {
        // 静默
      }
    }
    return true;
  }

  // 按 64KB 拆分
  function splitBatches(events: SdkEvent[]): SdkEvent[][] {
    const batches: SdkEvent[][] = [];
    let current: SdkEvent[] = [];
    let currentSize = 0;
    const overhead = serialize([]).length;

    for (const event of events) {
      const eventSize = JSON.stringify(event).length + 1;
      if (currentSize + eventSize + overhead > BEACON_MAX_BYTES && current.length > 0) {
        batches.push(current);
        current = [];
        currentSize = 0;
      }
      current.push(event);
      currentSize += eventSize;
    }
    if (current.length > 0) batches.push(current);
    return batches;
  }

  return {
    async sendBatch(events: SdkEvent[]): Promise<boolean> {
      if (events.length === 0) return true;

      const channel = preferredChannel === "auto" ? detectBestChannel() : preferredChannel;

      switch (channel) {
        case "beacon": {
          if (canBeacon()) {
            const ok = sendViaBeacon(events);
            if (ok) return true;
          }
          // beacon 失败降级 fetch
          if (canFetch()) return sendViaFetch(events);
          sendViaImage(events);
          return true;
        }
        case "fetch": {
          if (canFetch()) {
            const ok = await sendViaFetch(events);
            if (ok) return true;
          }
          // fetch 失败降级 beacon
          if (canBeacon()) return sendViaBeacon(events);
          sendViaImage(events);
          return true;
        }
        case "image": {
          sendViaImage(events);
          return true;
        }
        default: {
          logger.warn("未知 transport channel", channel);
          return false;
        }
      }
    },
  };
}

function detectBestChannel(): "beacon" | "fetch" | "image" {
  // pagehide 场景优先 beacon；正常场景优先 fetch
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      return "beacon";
    }
  }
  if (typeof fetch !== "undefined") return "fetch";
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") return "beacon";
  return "image";
}
