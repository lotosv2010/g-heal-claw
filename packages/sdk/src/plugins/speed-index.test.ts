import { PerformanceEventSchema } from "@g-heal-claw/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Hub } from "../hub.js";
import { createLogger } from "../logger.js";

/**
 * SpeedIndexPlugin 单元测试（ADR-0018 P1.1 / ADR-0018 P0.1）
 *
 * 覆盖：
 *  - paint + largest-contentful-paint Observer 订阅
 *  - load + settleMs 正常路径：FP/FCP/LCP → SI 梯形法 AUC
 *  - pagehide 兜底：未 settle 也强制上报
 *  - FCP 缺失 → 跳过上报
 *  - rating 阈值：≤3400 good / ≤5800 needs / >5800 poor
 *  - 无 paint entry 支持 → warn + no-op
 */

function buildHub(sendSpy: ReturnType<typeof vi.fn>): Hub {
  return {
    dsn: {
      protocol: "http",
      publicKey: "pk",
      host: "localhost",
      projectId: "demo",
      ingestUrl: "http://localhost:3001/ingest/v1/events",
    },
    options: {
      dsn: "http://pk@localhost:3001/demo",
      environment: "test",
      maxBreadcrumbs: 10,
      debug: false,
    },
    logger: createLogger(false),
    transport: {
      name: "mock",
      send: sendSpy,
      async flush() {
        return true;
      },
    },
    scope: { tags: {}, context: {}, breadcrumbs: [] },
    sessionId: "sess-1",
    setUser() {},
    setTag() {},
    setContext() {},
    addBreadcrumb() {},
    getScopeSnapshot() {
      return { tags: {}, context: {}, breadcrumbs: [] };
    },
  };
}

type POCallback = (list: {
  getEntries: () => readonly PerformanceEntry[];
}) => void;
const poBuckets: Record<string, POCallback[]> = {};
let disconnectCount = 0;

class FakePO {
  public disconnect = vi.fn(() => {
    disconnectCount += 1;
  });
  public constructor(public cb: POCallback) {}
  public observe(init: { type?: string }): void {
    if (!init.type) return;
    (poBuckets[init.type] ??= []).push(this.cb);
  }
}

function installFakePO(
  supportedTypes: readonly string[] = [
    "paint",
    "largest-contentful-paint",
  ],
): void {
  Object.defineProperty(globalThis, "PerformanceObserver", {
    configurable: true,
    writable: true,
    value: FakePO,
  });
  Object.defineProperty(
    (globalThis as unknown as { PerformanceObserver: typeof PerformanceObserver })
      .PerformanceObserver,
    "supportedEntryTypes",
    {
      configurable: true,
      get: () => supportedTypes,
    },
  );
}

function emit(
  type: string,
  entries: readonly { name: string; startTime: number }[],
): void {
  for (const cb of poBuckets[type] ?? []) {
    cb({
      getEntries: () =>
        entries.map(
          (e) =>
            ({
              name: e.name,
              startTime: e.startTime,
              duration: 0,
              entryType: type,
            }) as PerformanceEntry,
        ),
    });
  }
}

beforeEach(() => {
  Object.keys(poBuckets).forEach((k) => delete poBuckets[k]);
  disconnectCount = 0;
  vi.useFakeTimers();
  installFakePO();
  Object.defineProperty(document, "readyState", {
    configurable: true,
    get: () => "complete",
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("speedIndexPlugin — 正常上报", () => {
  it("FP/FCP/LCP 齐全时 settleMs 后上报 SI 事件（通过 Schema）", async () => {
    const { speedIndexPlugin } = await import("./speed-index.js");
    const send = vi.fn().mockResolvedValue(true);
    speedIndexPlugin({ settleMs: 1000 }).setup(buildHub(send), { dsn: "x" });
    emit("paint", [
      { name: "first-paint", startTime: 500 },
      { name: "first-contentful-paint", startTime: 800 },
    ]);
    emit("largest-contentful-paint", [
      { name: "", startTime: 2000 },
    ]);
    vi.advanceTimersByTime(1100);
    expect(send).toHaveBeenCalledTimes(1);
    const event = send.mock.calls[0]?.[0];
    expect(PerformanceEventSchema.safeParse(event).success).toBe(true);
    expect(event.metric).toBe("SI");
    expect(event.value).toBeGreaterThan(0);
    expect(disconnectCount).toBeGreaterThanOrEqual(1);
  });

  it("rating 阈值映射：SI ≤ 3400 → good", async () => {
    const { speedIndexPlugin } = await import("./speed-index.js");
    const send = vi.fn().mockResolvedValue(true);
    speedIndexPlugin({ settleMs: 100 }).setup(buildHub(send), { dsn: "x" });
    emit("paint", [
      { name: "first-paint", startTime: 100 },
      { name: "first-contentful-paint", startTime: 300 },
    ]);
    emit("largest-contentful-paint", [{ name: "", startTime: 400 }]);
    vi.advanceTimersByTime(200);
    expect(send.mock.calls[0]?.[0].rating).toBe("good");
  });

  it("rating 阈值映射：3400 < SI ≤ 5800 → needs-improvement", async () => {
    const { speedIndexPlugin } = await import("./speed-index.js");
    const send = vi.fn().mockResolvedValue(true);
    speedIndexPlugin({ settleMs: 100 }).setup(buildHub(send), { dsn: "x" });
    emit("paint", [
      { name: "first-paint", startTime: 2000 },
      { name: "first-contentful-paint", startTime: 4000 },
    ]);
    emit("largest-contentful-paint", [{ name: "", startTime: 6000 }]);
    vi.advanceTimersByTime(200);
    expect(send.mock.calls[0]?.[0].rating).toBe("needs-improvement");
  });

  it("rating 阈值映射：SI > 5800 → poor", async () => {
    const { speedIndexPlugin } = await import("./speed-index.js");
    const send = vi.fn().mockResolvedValue(true);
    speedIndexPlugin({ settleMs: 100 }).setup(buildHub(send), { dsn: "x" });
    emit("paint", [
      { name: "first-paint", startTime: 5000 },
      { name: "first-contentful-paint", startTime: 7000 },
    ]);
    emit("largest-contentful-paint", [{ name: "", startTime: 10_000 }]);
    vi.advanceTimersByTime(200);
    expect(send.mock.calls[0]?.[0].rating).toBe("poor");
  });
});

describe("speedIndexPlugin — 兜底路径", () => {
  it("FCP 缺失 → 不上报（避免发错数据）", async () => {
    const { speedIndexPlugin } = await import("./speed-index.js");
    const send = vi.fn().mockResolvedValue(true);
    speedIndexPlugin({ settleMs: 100 }).setup(buildHub(send), { dsn: "x" });
    emit("paint", [{ name: "first-paint", startTime: 500 }]);
    vi.advanceTimersByTime(200);
    expect(send).not.toHaveBeenCalled();
  });

  it("pagehide 提前触发也能上报（只要 FCP 已有）", async () => {
    const { speedIndexPlugin } = await import("./speed-index.js");
    const send = vi.fn().mockResolvedValue(true);
    speedIndexPlugin({ settleMs: 99_999 }).setup(buildHub(send), { dsn: "x" });
    emit("paint", [
      { name: "first-paint", startTime: 500 },
      { name: "first-contentful-paint", startTime: 800 },
    ]);
    emit("largest-contentful-paint", [{ name: "", startTime: 2000 }]);
    window.dispatchEvent(new Event("pagehide"));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].metric).toBe("SI");
  });

  it("LCP 缺失时用 FCP 代偿，不抛错", async () => {
    const { speedIndexPlugin } = await import("./speed-index.js");
    const send = vi.fn().mockResolvedValue(true);
    speedIndexPlugin({ settleMs: 100 }).setup(buildHub(send), { dsn: "x" });
    emit("paint", [
      { name: "first-paint", startTime: 500 },
      { name: "first-contentful-paint", startTime: 800 },
    ]);
    vi.advanceTimersByTime(200);
    // LCP 缺失 → lcp=fcp → 段 3 为 0，SI = 段 1 + 段 2
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("speedIndexPlugin — 降级", () => {
  it("supportedEntryTypes 不含 paint → warn + no-op", async () => {
    installFakePO([]);
    const { speedIndexPlugin } = await import("./speed-index.js");
    const send = vi.fn().mockResolvedValue(true);
    const hub = buildHub(send);
    const warn = vi.spyOn(hub.logger, "warn").mockImplementation(() => {});
    speedIndexPlugin().setup(hub, { dsn: "x" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(poBuckets["paint"]).toBeUndefined();
  });
});
