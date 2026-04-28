import { PerformanceEventSchema } from "@g-heal-claw/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Hub } from "../hub.js";
import { createLogger } from "../logger.js";

/**
 * FSP 插件测试（ADR-0018 P0.3）
 *
 * 覆盖路径：
 *  - MutationObserver + rAF + settleMs 正常路径（首次 DOM 变化 → 1s 静默后上报）
 *  - load 事件兜底（无 body 变化的静态页面）
 *  - pagehide 兜底（提前卸载）
 *  - minFspMs 丢弃（防误判）
 *  - 非浏览器 / 无 MutationObserver 降级
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

/** 最小化 MutationObserver 桩：允许测试通过 `triggerMutation()` 手动触发回调 */
type MoCallback = (records: readonly MutationRecord[]) => void;
let moCallbacks: MoCallback[] = [];
let moDisconnectCount = 0;

class FakeMutationObserver {
  public disconnect = vi.fn(() => {
    moDisconnectCount += 1;
  });
  public constructor(public cb: MoCallback) {
    moCallbacks.push(cb);
  }
  public observe(): void {
    // no-op
  }
  public takeRecords(): readonly MutationRecord[] {
    return [];
  }
}

function triggerMutation(): void {
  for (const cb of moCallbacks) cb([]);
}

let rafCallbacks: FrameRequestCallback[] = [];
function flushRaf(): void {
  const pending = rafCallbacks.splice(0, rafCallbacks.length);
  for (const cb of pending) cb(performance.now());
}

beforeEach(() => {
  moCallbacks = [];
  moDisconnectCount = 0;
  rafCallbacks = [];
  vi.useFakeTimers();
  Object.defineProperty(globalThis, "MutationObserver", {
    configurable: true,
    writable: true,
    value: FakeMutationObserver,
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(
    (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return 1 as unknown as number;
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("fspPlugin — 正常路径", () => {
  it("DOM 变化后 settleMs 静默窗口结束时上报 FSP 事件（通过 Schema）", async () => {
    const { fspPlugin } = await import("./fsp.js");
    const send = vi.fn().mockResolvedValue(true);
    fspPlugin({ settleMs: 500, minFspMs: 0 }).setup(buildHub(send), {
      dsn: "x",
    });

    // 触发一次 DOM 变化 + rAF 落定
    triggerMutation();
    flushRaf();

    // 静默窗口内不应上报
    vi.advanceTimersByTime(400);
    expect(send).not.toHaveBeenCalled();

    // 超过 settleMs → 上报
    vi.advanceTimersByTime(200);
    expect(send).toHaveBeenCalledTimes(1);
    const event = send.mock.calls[0]?.[0];
    expect(PerformanceEventSchema.safeParse(event).success).toBe(true);
    expect(event.metric).toBe("FSP");
    expect(event.value).toBeGreaterThanOrEqual(0);
    expect(moDisconnectCount).toBe(1);
  });

  it("多次 DOM 变化每次都重置静默定时器，最后一次变化起算 settleMs", async () => {
    const { fspPlugin } = await import("./fsp.js");
    const send = vi.fn().mockResolvedValue(true);
    fspPlugin({ settleMs: 500, minFspMs: 0 }).setup(buildHub(send), {
      dsn: "x",
    });

    triggerMutation();
    flushRaf();
    vi.advanceTimersByTime(400);
    triggerMutation();
    flushRaf();
    vi.advanceTimersByTime(400);
    // 还差 100ms 才满足静默，未上报
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("FSP value ≤ 1800ms → rating=good；≤3000 → needs-improvement；>3000 → poor", async () => {
    const { fspPlugin } = await import("./fsp.js");
    const send = vi.fn().mockResolvedValue(true);
    // 通过控制 performance.now 返回值来伪造 FSP 数值
    const nowSpy = vi.spyOn(performance, "now").mockReturnValue(1500);
    fspPlugin({ settleMs: 100, minFspMs: 0 }).setup(buildHub(send), {
      dsn: "x",
    });
    triggerMutation();
    flushRaf();
    vi.advanceTimersByTime(200);
    expect(send.mock.calls[0]?.[0].rating).toBe("good");

    // 下一次 FSP = 2500
    nowSpy.mockReturnValue(2500);
    const send2 = vi.fn().mockResolvedValue(true);
    moCallbacks = [];
    rafCallbacks = [];
    fspPlugin({ settleMs: 100, minFspMs: 0 }).setup(buildHub(send2), {
      dsn: "x",
    });
    triggerMutation();
    flushRaf();
    vi.advanceTimersByTime(200);
    expect(send2.mock.calls[0]?.[0].rating).toBe("needs-improvement");

    // FSP = 5000 → poor
    nowSpy.mockReturnValue(5000);
    const send3 = vi.fn().mockResolvedValue(true);
    moCallbacks = [];
    rafCallbacks = [];
    fspPlugin({ settleMs: 100, minFspMs: 0 }).setup(buildHub(send3), {
      dsn: "x",
    });
    triggerMutation();
    flushRaf();
    vi.advanceTimersByTime(200);
    expect(send3.mock.calls[0]?.[0].rating).toBe("poor");
  });
});

describe("fspPlugin — 兜底路径", () => {
  it("FSP 低于 minFspMs 时丢弃，不上报", async () => {
    const { fspPlugin } = await import("./fsp.js");
    const send = vi.fn().mockResolvedValue(true);
    vi.spyOn(performance, "now").mockReturnValue(50);
    fspPlugin({ settleMs: 100, minFspMs: 100 }).setup(buildHub(send), {
      dsn: "x",
    });
    triggerMutation();
    flushRaf();
    vi.advanceTimersByTime(200);
    expect(send).not.toHaveBeenCalled();
  });

  it("pagehide 兜底：未 settle 也强制封板上报一次", async () => {
    const { fspPlugin } = await import("./fsp.js");
    const send = vi.fn().mockResolvedValue(true);
    vi.spyOn(performance, "now").mockReturnValue(1200);
    fspPlugin({ settleMs: 5000, minFspMs: 0 }).setup(buildHub(send), {
      dsn: "x",
    });
    triggerMutation();
    flushRaf();
    // settle 尚未到达
    vi.advanceTimersByTime(1000);
    expect(send).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("pagehide"));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].metric).toBe("FSP");
  });
});

describe("fspPlugin — 降级分支", () => {
  it("无 MutationObserver 时 warn + no-op", async () => {
    const { fspPlugin } = await import("./fsp.js");
    const original = globalThis.MutationObserver;
    // @ts-expect-error 降级测试
    delete globalThis.MutationObserver;
    const send = vi.fn().mockResolvedValue(true);
    const hub = buildHub(send);
    const warn = vi.spyOn(hub.logger, "warn").mockImplementation(() => {});
    fspPlugin().setup(hub, { dsn: "x" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    globalThis.MutationObserver = original;
  });
});
