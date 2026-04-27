import type { SdkEvent } from "@g-heal-claw/shared";
import type { Logger } from "../logger.js";
import type { Transport } from "./types.js";

interface FetchTransportOptions {
  readonly endpoint: string;
  readonly dsn: string;
  readonly logger: Logger;
}

/**
 * 骨架占位 Transport：单事件 POST，keepalive=true
 *
 * 故意不做批量、不做重试、不落 IndexedDB——那是 T1.2.5 / T1.2.6 的工作。
 * 当前实现仅为端到端冒烟：demo 触发 → Network 能观测到 POST。
 */
export function createFetchTransport(
  opts: FetchTransportOptions,
): Transport {
  const { endpoint, dsn, logger } = opts;

  return {
    name: "fetch",
    async send(event: SdkEvent): Promise<boolean> {
      if (typeof fetch === "undefined") {
        logger.warn("fetch 不可用，transport 降级待 T1.2.5 实现");
        return false;
      }
      try {
        const body = JSON.stringify({
          dsn,
          sentAt: Date.now(),
          events: [event],
        });
        await fetch(endpoint, {
          method: "POST",
          keepalive: true,
          headers: { "content-type": "application/json" },
          body,
          // 故意不带 credentials；DSN 内联鉴权
          mode: "cors",
        });
        return true;
      } catch (err) {
        logger.debug("transport send 失败", err);
        return false;
      }
    },
    async flush(): Promise<boolean> {
      return true;
    },
  };
}
