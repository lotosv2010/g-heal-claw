import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PerformanceEvent } from "@g-heal-claw/shared";
import { fspPlugin } from "../../src/plugins/fsp.js";
import type { Hub, Scope } from "../../src/hub.js";
import type { Transport } from "../../src/transport/types.js";

/**
 * FspPlugin 单元测试（ADR-0018 P1.1）
 *
 * 覆盖：
 *  - 无 MutationObserver → no-op
 *  - DOM mutation + settleMs 后上报
 *  - 连续 mutation 会重置 settle 定时器
 *  - 无 mutation + load 兜底
 *  - pagehide 兜底（无 mutation 时用 performance.now()）
 *  - rating 阈值 good/needs/poor
 *  - maxFspMs 上限裁剪
 *  - minFspMs 低于阈值跳过
 */

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

describe("fspPlugin / 环境降级", () => {
  const OriginalMO = window.MutationObserver;

  afterEach(() => {
    (window as unknown as { MutationObserver: unknown }).MutationObserver =
      OriginalMO;
  });

  it("无 MutationObserver → no-op 且不抛错", () => {
    (window as unknown as { MutationObserver: unknown }).MutationObserver =
      undefined;
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    expect(() => fspPlugin().setup(hub, { dsn: "" })).not.toThrow();
    expect(transport.events).toHaveLength(0);
  });
});

describe("fspPlugin / 采集路径", () => {
  let moCallback: MutationCallback | null;
  let moInstances: number;
  const OriginalMO = window.MutationObserver;

  beforeEach(() => {
    moCallback = null;
    moInstances = 0;
    vi.useFakeTimers();
    // readyState != complete：让 load 事件驱动
    Object.defineProperty(document, "readyState", {
      configurable: true,
      value: "loading",
    });
    // 使用可控 MO：记录回调，调用 emit() 触发
    (window as unknown as { MutationObserver: unknown }).MutationObserver =
      class {
        constructor(cb: MutationCallback) {
          moInstances += 1;
          moCallback = cb;
        }
        observe() {}
        disconnect() {}
        takeRecords(): MutationRecord[] {
          return [];
        }
      };
    // rAF 降级为 setTimeout(0)：与 jsdom 下 fake timers 协作
    (window as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame =
      (cb: FrameRequestCallback) =>
        window.setTimeout(() => cb(performance.now()), 0);
  });

  afterEach(() => {
    vi.useRealTimers();
    (window as unknown as { MutationObserver: unknown }).MutationObserver =
      OriginalMO;
  });

  function emitMutation(): void {
    if (!moCallback) throw new Error("MO callback 未捕获");
    moCallback([] as unknown as MutationRecord[], {} as MutationObserver);
  }

  it("DOM mutation + settleMs 后上报 FSP", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    // 通过 mock performance.now 控制 FSP 值落在 good 档
    const nowSpy = vi.spyOn(performance, "now").mockReturnValue(1200);

    fspPlugin({ settleMs: 500, minFspMs: 100 }).setup(hub, { dsn: "" });
    expect(moInstances).toBeGreaterThan(0);

    emitMutation();
    // rAF(setTimeout 0) → markMutation → settleTimer
    vi.advanceTimersByTime(0);
    vi.advanceTimersByTime(500);

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].metric).toBe("FSP");
    expect(transport.events[0].value).toBe(1200);
    expect(transport.events[0].rating).toBe("good");
    nowSpy.mockRestore();
  });

  it("连续 mutation 重置 settle 定时器", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    const nowSpy = vi.spyOn(performance, "now").mockReturnValue(2000);

    fspPlugin({ settleMs: 500 }).setup(hub, { dsn: "" });

    emitMutation();
    vi.advanceTimersByTime(0); // rAF
    vi.advanceTimersByTime(400); // 400ms 未达 settle
    expect(transport.events).toHaveLength(0);

    // 第二次 mutation 应当重置定时器到另一个 500ms
    emitMutation();
    vi.advanceTimersByTime(0);
    vi.advanceTimersByTime(400);
    expect(transport.events).toHaveLength(0); // 仍未 settle

    vi.advanceTimersByTime(200); // 累计已过 500ms
    expect(transport.events).toHaveLength(1);
    nowSpy.mockRestore();
  });

  it("无 mutation + load 兜底用 performance.now()", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    const nowSpy = vi.spyOn(performance, "now").mockReturnValue(2500);

    fspPlugin({ settleMs: 500 }).setup(hub, { dsn: "" });

    // 从未触发 mutation，直接 load
    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(500);

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].metric).toBe("FSP");
    expect(transport.events[0].value).toBe(2500);
    expect(transport.events[0].rating).toBe("needs-improvement");
    nowSpy.mockRestore();
  });

  it("pagehide 兜底：会话提前结束", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    const nowSpy = vi.spyOn(performance, "now").mockReturnValue(4000);

    fspPlugin({ settleMs: 5000 }).setup(hub, { dsn: "" });

    // 不等 settle，直接 pagehide
    window.dispatchEvent(new Event("pagehide"));

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].rating).toBe("poor");
    nowSpy.mockRestore();
  });

  it("低于 minFspMs → 跳过上报", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    const nowSpy = vi.spyOn(performance, "now").mockReturnValue(50);

    fspPlugin({ settleMs: 500, minFspMs: 100 }).setup(hub, { dsn: "" });

    emitMutation();
    vi.advanceTimersByTime(0);
    vi.advanceTimersByTime(500);

    expect(transport.events).toHaveLength(0);
    nowSpy.mockRestore();
  });

  it("超过 maxFspMs → 裁剪到上限", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    const nowSpy = vi.spyOn(performance, "now").mockReturnValue(999_999);

    fspPlugin({ settleMs: 500, maxFspMs: 8000 }).setup(hub, { dsn: "" });

    emitMutation();
    vi.advanceTimersByTime(0);
    vi.advanceTimersByTime(500);

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].value).toBe(8000);
    nowSpy.mockRestore();
  });
});
