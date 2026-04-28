import { LongTaskEventSchema } from "@g-heal-claw/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Hub } from "../hub.js";
import { createLogger } from "../logger.js";

/**
 * LongTaskPlugin 单元测试（ADR-0018 P1.1）
 *
 * 覆盖：
 *  - PerformanceObserver 订阅 longtask 条目 → 事件映射 + Schema 通过
 *  - tier 分级：long_task (<2s) / jank (<5s) / unresponsive (≥5s)
 *  - minDurationMs 过滤 + maxBatch flush + flushInterval 周期 flush
 *  - pagehide / visibilitychange=hidden 兜底 flush
 *  - supportedEntryTypes 不含 longtask 时降级 warn + no-op
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
let poCallback: POCallback | null = null;

class FakePO {
  public disconnect = vi.fn();
  public constructor(cb: POCallback) {
    poCallback = cb;
  }
  public observe(): void {
    // no-op
  }
}

function installFakePO(supportedTypes: readonly string[] = ["longtask"]): void {
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

function emit(entries: readonly PerformanceEntry[]): void {
  poCallback?.({ getEntries: () => entries });
}

function mkEntry(durationMs: number, startMs = 0): PerformanceEntry {
  return {
    name: "self",
    entryType: "longtask",
    startTime: startMs,
    duration: durationMs,
    toJSON: () => ({}),
  } as unknown as PerformanceEntry;
}

beforeEach(() => {
  poCallback = null;
  vi.useFakeTimers();
  installFakePO();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("longTaskPlugin — 采集 + Schema", () => {
  it("longtask 条目映射为 LongTaskEvent 并通过 Schema", async () => {
    const { longTaskPlugin } = await import("./long-task.js");
    const send = vi.fn().mockResolvedValue(true);
    longTaskPlugin({ maxBatch: 1 }).setup(buildHub(send), { dsn: "x" });
    emit([mkEntry(120, 500)]);
    expect(send).toHaveBeenCalledTimes(1);
    const event = send.mock.calls[0]?.[0];
    expect(LongTaskEventSchema.safeParse(event).success).toBe(true);
    expect(event.type).toBe("long_task");
    expect(event.duration).toBe(120);
    expect(event.startTime).toBe(500);
    expect(event.tier).toBe("long_task");
  });

  it("duration<minDurationMs 被过滤", async () => {
    const { longTaskPlugin } = await import("./long-task.js");
    const send = vi.fn().mockResolvedValue(true);
    longTaskPlugin({ minDurationMs: 100, maxBatch: 1 }).setup(buildHub(send), {
      dsn: "x",
    });
    emit([mkEntry(50)]);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("longTaskPlugin — tier 分级", () => {
  it("< 2s → long_task", async () => {
    const { longTaskPlugin } = await import("./long-task.js");
    const send = vi.fn().mockResolvedValue(true);
    longTaskPlugin({ maxBatch: 1 }).setup(buildHub(send), { dsn: "x" });
    emit([mkEntry(1500)]);
    expect(send.mock.calls[0]?.[0].tier).toBe("long_task");
  });

  it("2s ≤ duration < 5s → jank", async () => {
    const { longTaskPlugin } = await import("./long-task.js");
    const send = vi.fn().mockResolvedValue(true);
    longTaskPlugin({ maxBatch: 1 }).setup(buildHub(send), { dsn: "x" });
    emit([mkEntry(3000)]);
    expect(send.mock.calls[0]?.[0].tier).toBe("jank");
  });

  it("duration ≥ 5s → unresponsive", async () => {
    const { longTaskPlugin } = await import("./long-task.js");
    const send = vi.fn().mockResolvedValue(true);
    longTaskPlugin({ maxBatch: 1 }).setup(buildHub(send), { dsn: "x" });
    emit([mkEntry(6000)]);
    expect(send.mock.calls[0]?.[0].tier).toBe("unresponsive");
  });
});

describe("longTaskPlugin — 批量与兜底", () => {
  it("达到 maxBatch 立即 flush，小于 maxBatch 等 flushInterval", async () => {
    const { longTaskPlugin } = await import("./long-task.js");
    const send = vi.fn().mockResolvedValue(true);
    longTaskPlugin({ maxBatch: 3, flushIntervalMs: 2000 }).setup(
      buildHub(send),
      { dsn: "x" },
    );
    emit([mkEntry(60), mkEntry(70)]);
    expect(send).not.toHaveBeenCalled();
    // 推进 interval 后 flush
    vi.advanceTimersByTime(2100);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("pagehide 触发强制 flush buffer 残留", async () => {
    const { longTaskPlugin } = await import("./long-task.js");
    const send = vi.fn().mockResolvedValue(true);
    longTaskPlugin({ maxBatch: 10, flushIntervalMs: 999_999 }).setup(
      buildHub(send),
      { dsn: "x" },
    );
    emit([mkEntry(80)]);
    expect(send).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("pagehide"));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("visibilitychange=hidden 也触发 flush", async () => {
    const { longTaskPlugin } = await import("./long-task.js");
    const send = vi.fn().mockResolvedValue(true);
    longTaskPlugin({ maxBatch: 10, flushIntervalMs: 999_999 }).setup(
      buildHub(send),
      { dsn: "x" },
    );
    emit([mkEntry(80)]);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("longTaskPlugin — 降级", () => {
  it("supportedEntryTypes 不含 longtask → warn + no-op", async () => {
    installFakePO([]);
    const { longTaskPlugin } = await import("./long-task.js");
    const send = vi.fn().mockResolvedValue(true);
    const hub = buildHub(send);
    const warn = vi.spyOn(hub.logger, "warn").mockImplementation(() => {});
    longTaskPlugin().setup(hub, { dsn: "x" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(poCallback).toBeNull();
  });

  it("PerformanceObserver 未定义 → warn + no-op", async () => {
    const original = globalThis.PerformanceObserver;
    // @ts-expect-error 降级测试
    delete globalThis.PerformanceObserver;
    const { longTaskPlugin } = await import("./long-task.js");
    const send = vi.fn().mockResolvedValue(true);
    const hub = buildHub(send);
    const warn = vi.spyOn(hub.logger, "warn").mockImplementation(() => {});
    longTaskPlugin().setup(hub, { dsn: "x" });
    expect(warn).toHaveBeenCalledTimes(1);
    globalThis.PerformanceObserver = original;
  });
});
