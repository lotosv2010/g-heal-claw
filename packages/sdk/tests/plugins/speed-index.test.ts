import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PerformanceEvent } from "@g-heal-claw/shared";
import { speedIndexPlugin } from "../../src/plugins/speed-index.js";
import type { Hub, Scope } from "../../src/hub.js";
import type { Transport } from "../../src/transport/types.js";

/**
 * SpeedIndexPlugin 单元测试（ADR-0018 P1.1）
 *
 * 覆盖：
 *  - PerformanceObserver / paint 不支持的降级
 *  - FP/FCP/LCP 齐备时梯形法计算
 *  - FP 缺失以 FCP 代偿；FCP 缺失整体跳过
 *  - load + settleMs 正常上报路径
 *  - pagehide 兜底
 *  - rating 三档判定（good/needs-improvement/poor）
 */

type PaintCallback = (list: {
  getEntries: () => readonly PerformanceEntry[];
}) => void;

interface ObserverState {
  type: "paint" | "largest-contentful-paint";
  cb: PaintCallback;
}

function makePaintEntry(name: string, startTime: number): PerformanceEntry {
  return {
    name,
    entryType: "paint",
    startTime,
    duration: 0,
    toJSON: () => ({}),
  } as PerformanceEntry;
}

function makeLcpEntry(startTime: number): PerformanceEntry {
  return {
    name: "",
    entryType: "largest-contentful-paint",
    startTime,
    duration: 0,
    toJSON: () => ({}),
  } as PerformanceEntry;
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

function createSpyTransport(): Transport & { events: PerformanceEvent[] } {
  const events: PerformanceEvent[] = [];
  return {
    name: "spy",
    events,
    send: vi.fn(async (event) => {
      events.push(event as PerformanceEvent);
      return true;
    }),
    flush: vi.fn(async () => true),
  };
}

describe("speedIndexPlugin / 环境降级", () => {
  const OriginalPO = window.PerformanceObserver;

  afterEach(() => {
    (window as unknown as { PerformanceObserver: unknown }).PerformanceObserver =
      OriginalPO;
  });

  it("无 PerformanceObserver → no-op", () => {
    (
      window as unknown as { PerformanceObserver: unknown }
    ).PerformanceObserver = undefined;
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    expect(() => speedIndexPlugin().setup(hub, { dsn: "" })).not.toThrow();
    expect(transport.events).toHaveLength(0);
  });

  it("supportedEntryTypes 不含 paint → no-op", () => {
    (
      window as unknown as { PerformanceObserver: unknown }
    ).PerformanceObserver = class {
      static supportedEntryTypes: readonly string[] = ["longtask"];
      observe() {}
      disconnect() {}
    };
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    speedIndexPlugin().setup(hub, { dsn: "" });
    expect(transport.events).toHaveLength(0);
  });
});

describe("speedIndexPlugin / 采集计算", () => {
  let observers: ObserverState[] = [];
  const OriginalPO = window.PerformanceObserver;

  beforeEach(() => {
    observers = [];
    vi.useFakeTimers();
    (
      window as unknown as { PerformanceObserver: unknown }
    ).PerformanceObserver = class {
      static supportedEntryTypes: readonly string[] = [
        "paint",
        "largest-contentful-paint",
      ];
      private cb: PaintCallback;
      constructor(cb: PaintCallback) {
        this.cb = cb;
      }
      observe(init: { type: string }) {
        observers.push({
          type: init.type as ObserverState["type"],
          cb: this.cb,
        });
      }
      disconnect() {}
    };
    // 保证 readyState != complete，让 load 事件驱动触发
    Object.defineProperty(document, "readyState", {
      configurable: true,
      value: "loading",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    (window as unknown as { PerformanceObserver: unknown }).PerformanceObserver =
      OriginalPO;
  });

  function emitPaint(entries: PerformanceEntry[]): void {
    const o = observers.find((x) => x.type === "paint");
    if (!o) throw new Error("paint observer 未注册");
    o.cb({ getEntries: () => entries });
  }

  function emitLcp(entries: PerformanceEntry[]): void {
    const o = observers.find((x) => x.type === "largest-contentful-paint");
    if (!o) throw new Error("lcp observer 未注册");
    o.cb({ getEntries: () => entries });
  }

  it("FP/FCP/LCP 齐备 → 梯形法计算 + rating", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    speedIndexPlugin({ settleMs: 100 }).setup(hub, { dsn: "" });

    emitPaint([
      makePaintEntry("first-paint", 500),
      makePaintEntry("first-contentful-paint", 1500),
    ]);
    emitLcp([makeLcpEntry(2500)]);

    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(100);

    expect(transport.events).toHaveLength(1);
    const e = transport.events[0];
    expect(e.metric).toBe("SI");
    // 粗略校验 SI 在合理范围（0 < SI < LCP）
    expect(e.value).toBeGreaterThan(0);
    expect(e.value).toBeLessThan(2500);
    // rating（SI ~= 500*0.95 + 1000*0.7 + 1000*0.25 = 475+700+250 = 1425 → good）
    expect(e.rating).toBe("good");
  });

  it("FP 缺失 → 以 FCP 代偿仍能计算", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    speedIndexPlugin({ settleMs: 100 }).setup(hub, { dsn: "" });

    emitPaint([makePaintEntry("first-contentful-paint", 1500)]);
    emitLcp([makeLcpEntry(3000)]);

    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(100);

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].metric).toBe("SI");
  });

  it("FCP 缺失 → 整体跳过上报", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    speedIndexPlugin({ settleMs: 100 }).setup(hub, { dsn: "" });

    // 只有 FP，无 FCP
    emitPaint([makePaintEntry("first-paint", 500)]);

    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(100);

    expect(transport.events).toHaveLength(0);
  });

  it("poor rating：SI > 5800ms", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    speedIndexPlugin({ settleMs: 100 }).setup(hub, { dsn: "" });

    // 构造极慢页面：FP=3000, FCP=8000, LCP=12000
    emitPaint([
      makePaintEntry("first-paint", 3000),
      makePaintEntry("first-contentful-paint", 8000),
    ]);
    emitLcp([makeLcpEntry(12000)]);

    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(100);

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].rating).toBe("poor");
  });

  it("pagehide 兜底：load 未到也能封板", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    speedIndexPlugin({ settleMs: 5000 }).setup(hub, { dsn: "" });

    emitPaint([
      makePaintEntry("first-paint", 500),
      makePaintEntry("first-contentful-paint", 1500),
    ]);
    emitLcp([makeLcpEntry(2500)]);

    // 不触发 load，直接 pagehide
    window.dispatchEvent(new Event("pagehide"));

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].metric).toBe("SI");
  });

  it("仅触发一次：load+settleMs 后再 pagehide 不会重复上报", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    speedIndexPlugin({ settleMs: 100 }).setup(hub, { dsn: "" });

    emitPaint([
      makePaintEntry("first-paint", 500),
      makePaintEntry("first-contentful-paint", 1500),
    ]);
    emitLcp([makeLcpEntry(2500)]);

    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(100);
    expect(transport.events).toHaveLength(1);

    window.dispatchEvent(new Event("pagehide"));
    expect(transport.events).toHaveLength(1);
  });
});
