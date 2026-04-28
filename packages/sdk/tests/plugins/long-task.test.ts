import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LongTaskEvent } from "@g-heal-claw/shared";
import { longTaskPlugin } from "../../src/plugins/long-task.js";
import type { Hub, Scope } from "../../src/hub.js";
import type { Transport } from "../../src/transport/types.js";

/**
 * LongTaskPlugin 单元测试（ADR-0018 P1.1）
 *
 * 覆盖：
 *  - PerformanceObserver 不支持 / 不支持 longtask 的降级
 *  - 3 级分级（long_task / jank / unresponsive）按 duration 写入 tier
 *  - 低于 minDurationMs 的条目被忽略
 *  - maxBatch 达到阈值立即 flush
 *  - visibilitychange=hidden / pagehide 兜底 flush
 *  - attribution 开关
 */

interface FakeLongTaskEntry extends PerformanceEntry {
  duration: number;
  startTime: number;
  attribution?: ReadonlyArray<{
    name: string;
    entryType: string;
    startTime: number;
    duration: number;
  }>;
}

function makeEntry(
  duration: number,
  opts: Partial<FakeLongTaskEntry> = {},
): FakeLongTaskEntry {
  return {
    name: opts.name ?? "self",
    entryType: "longtask",
    startTime: opts.startTime ?? 100,
    duration,
    attribution: opts.attribution,
    toJSON: () => ({}),
  } as FakeLongTaskEntry;
}

function createStubHub(transport: Transport): Hub {
  const scope: Scope = { tags: {}, context: {}, breadcrumbs: [] };
  return {
    dsn: {
      protocol: "http",
      publicKey: "pk_test",
      host: "localhost",
      port: "3001",
      projectId: "proj_test",
      ingestUrl: "http://localhost:3001/ingest/v1/events",
    },
    options: {
      dsn: "http://pk_test@localhost:3001/proj_test",
      environment: "test",
      maxBreadcrumbs: 100,
      debug: false,
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    transport,
    scope,
    sessionId: "sess_test",
    setUser: vi.fn(),
    setTag: vi.fn(),
    setContext: vi.fn(),
    addBreadcrumb: vi.fn(),
    getScopeSnapshot: () => scope,
  };
}

function createSpyTransport(): Transport & { events: LongTaskEvent[] } {
  const events: LongTaskEvent[] = [];
  return {
    name: "spy",
    events,
    send: vi.fn(async (event) => {
      events.push(event as LongTaskEvent);
      return true;
    }),
    flush: vi.fn(async () => true),
  };
}

describe("longTaskPlugin / 环境降级", () => {
  const OriginalPO = window.PerformanceObserver;

  afterEach(() => {
    // 还原 PerformanceObserver
    (window as unknown as { PerformanceObserver: unknown }).PerformanceObserver =
      OriginalPO;
  });

  it("无 PerformanceObserver → no-op 且不抛错", () => {
    (
      window as unknown as { PerformanceObserver: unknown }
    ).PerformanceObserver = undefined;
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    expect(() => longTaskPlugin().setup(hub, { dsn: "" })).not.toThrow();
    expect(transport.events).toHaveLength(0);
  });

  it("supportedEntryTypes 不含 longtask → no-op", () => {
    (
      window as unknown as { PerformanceObserver: unknown }
    ).PerformanceObserver = class {
      static supportedEntryTypes: readonly string[] = ["paint"];
      observe() {}
      disconnect() {}
    };
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    longTaskPlugin().setup(hub, { dsn: "" });
    expect(transport.events).toHaveLength(0);
  });
});

describe("longTaskPlugin / 采集 + 分级", () => {
  type Callback = (list: {
    getEntries: () => readonly FakeLongTaskEntry[];
  }) => void;
  let capturedCallback: Callback | null;
  const OriginalPO = window.PerformanceObserver;

  beforeEach(() => {
    capturedCallback = null;
    (
      window as unknown as { PerformanceObserver: unknown }
    ).PerformanceObserver = class {
      static supportedEntryTypes: readonly string[] = ["longtask"];
      constructor(cb: Callback) {
        capturedCallback = cb;
      }
      observe() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    (window as unknown as { PerformanceObserver: unknown }).PerformanceObserver =
      OriginalPO;
  });

  function emit(entries: FakeLongTaskEntry[]): void {
    if (!capturedCallback) throw new Error("PO callback 未捕获");
    capturedCallback({ getEntries: () => entries });
  }

  it("duration 60ms → tier=long_task", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    longTaskPlugin({ maxBatch: 1 }).setup(hub, { dsn: "" });

    emit([makeEntry(60)]);

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].tier).toBe("long_task");
    expect(transport.events[0].duration).toBe(60);
  });

  it("duration 2500ms → tier=jank", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    longTaskPlugin({ maxBatch: 1 }).setup(hub, { dsn: "" });

    emit([makeEntry(2500)]);

    expect(transport.events[0].tier).toBe("jank");
  });

  it("duration 6000ms → tier=unresponsive", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    longTaskPlugin({ maxBatch: 1 }).setup(hub, { dsn: "" });

    emit([makeEntry(6000)]);

    expect(transport.events[0].tier).toBe("unresponsive");
  });

  it("低于 minDurationMs → 不上报", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    longTaskPlugin({ minDurationMs: 50, maxBatch: 1 }).setup(hub, { dsn: "" });

    emit([makeEntry(30)]);

    expect(transport.events).toHaveLength(0);
  });

  it("maxBatch 达到阈值立即 flush", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    longTaskPlugin({ maxBatch: 3 }).setup(hub, { dsn: "" });

    // 一次性喂 3 条，命中 maxBatch 应当全部 flush
    emit([makeEntry(100), makeEntry(200), makeEntry(300)]);

    expect(transport.events).toHaveLength(3);
  });

  it("visibilitychange=hidden → flush 残留 buffer", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    longTaskPlugin({ maxBatch: 100 }).setup(hub, { dsn: "" });

    emit([makeEntry(100), makeEntry(200)]);
    // 未达 maxBatch 暂不 flush
    expect(transport.events).toHaveLength(0);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(transport.events).toHaveLength(2);
  });

  it("reportAttribution=false → 不携带 attribution 字段", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    longTaskPlugin({ maxBatch: 1, reportAttribution: false }).setup(hub, {
      dsn: "",
    });

    emit([
      makeEntry(100, {
        attribution: [
          {
            name: "script",
            entryType: "taskattribution",
            startTime: 50,
            duration: 100,
          },
        ],
      }),
    ]);

    expect(transport.events[0].attribution).toBeUndefined();
  });
});
