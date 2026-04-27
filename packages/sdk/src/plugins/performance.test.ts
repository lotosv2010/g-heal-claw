import { PerformanceEventSchema } from "@g-heal-claw/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Hub } from "../hub.js";
import { createLogger } from "../logger.js";

// 为 `window.addEventListener('load', ...)` 分支留钩子
let loadListener: (() => void) | null = null;

// Mock web-vitals：捕获每个 on* 注册的 handler 以便测试触发
const callbacks: Record<string, ((m: unknown) => void) | null> = {
  LCP: null,
  FCP: null,
  CLS: null,
  INP: null,
  TTFB: null,
};
vi.mock("web-vitals", () => ({
  onLCP: (cb: (m: unknown) => void) => {
    callbacks.LCP = cb;
  },
  onFCP: (cb: (m: unknown) => void) => {
    callbacks.FCP = cb;
  },
  onCLS: (cb: (m: unknown) => void) => {
    callbacks.CLS = cb;
  },
  onINP: (cb: (m: unknown) => void) => {
    callbacks.INP = cb;
  },
  onTTFB: (cb: (m: unknown) => void) => {
    callbacks.TTFB = cb;
  },
}));

function buildHub(sendSpy: ReturnType<typeof vi.fn>): Hub {
  const logger = createLogger(false);
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
    logger,
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

/** jsdom 默认不提供 PerformanceNavigationTiming；此处手工填充 */
function installNavigationEntry(): void {
  const entry = {
    startTime: 0,
    redirectStart: 0,
    redirectEnd: 0,
    domainLookupStart: 10,
    domainLookupEnd: 20,
    connectStart: 20,
    connectEnd: 50,
    secureConnectionStart: 0,
    requestStart: 50,
    responseStart: 100,
    responseEnd: 200,
    domInteractive: 300,
    domContentLoadedEventStart: 310,
    domContentLoadedEventEnd: 320,
    loadEventStart: 400,
    loadEventEnd: 450,
    type: "navigate",
    duration: 0,
    name: "",
    entryType: "navigation",
  };
  // jsdom 的 performance.getEntriesByType 返回空数组；直接覆盖
  vi.spyOn(performance, "getEntriesByType").mockImplementation((type) =>
    type === "navigation"
      ? ([entry] as unknown as PerformanceEntryList)
      : [],
  );
}

beforeEach(() => {
  callbacks.LCP = null;
  callbacks.FCP = null;
  callbacks.CLS = null;
  callbacks.INP = null;
  callbacks.TTFB = null;
  loadListener = null;
  vi.restoreAllMocks();
});

describe("performancePlugin — 基础订阅与事件构造", () => {
  it("setup 订阅 5 个 Web Vitals 回调", async () => {
    const { performancePlugin } = await import("./performance.js");
    installNavigationEntry();
    const send = vi.fn().mockResolvedValue(true);
    const plugin = performancePlugin();
    plugin.setup(buildHub(send), { dsn: "x" });
    expect(callbacks.LCP).toBeTypeOf("function");
    expect(callbacks.FCP).toBeTypeOf("function");
    expect(callbacks.CLS).toBeTypeOf("function");
    expect(callbacks.INP).toBeTypeOf("function");
    expect(callbacks.TTFB).toBeTypeOf("function");
  });

  it("LCP 回调触发时 transport.send 被调用且事件通过 Schema", async () => {
    const { performancePlugin } = await import("./performance.js");
    installNavigationEntry();
    const send = vi.fn().mockResolvedValue(true);
    performancePlugin().setup(buildHub(send), { dsn: "x" });
    callbacks.LCP?.({
      name: "LCP",
      value: 2100,
      rating: "good",
      delta: 2100,
      id: "v4-1",
      entries: [],
      navigationType: "navigate",
    });
    expect(send).toHaveBeenCalledTimes(1);
    const event = send.mock.calls[0]?.[0];
    expect(PerformanceEventSchema.safeParse(event).success).toBe(true);
    expect(event.type).toBe("performance");
    expect(event.metric).toBe("LCP");
    expect(event.value).toBe(2100);
    expect(event.rating).toBe("good");
    expect(event.navigation).toBeUndefined();
  });

  it("TTFB 回调触发时附带 Navigation 瀑布字段", async () => {
    const { performancePlugin } = await import("./performance.js");
    installNavigationEntry();
    const send = vi.fn().mockResolvedValue(true);
    performancePlugin().setup(buildHub(send), { dsn: "x" });
    callbacks.TTFB?.({
      name: "TTFB",
      value: 50,
      rating: "good",
      delta: 50,
      id: "v4-t",
      entries: [],
      navigationType: "navigate",
    });
    const event = send.mock.calls[0]?.[0];
    expect(PerformanceEventSchema.safeParse(event).success).toBe(true);
    expect(event.metric).toBe("TTFB");
    expect(event.navigation).toBeDefined();
    expect(event.navigation.total).toBe(450);
    expect(event.navigation.type).toBe("navigate");
  });

  it("回调 value 为负数时被夹到 0（防御浏览器异常）", async () => {
    const { performancePlugin } = await import("./performance.js");
    installNavigationEntry();
    const send = vi.fn().mockResolvedValue(true);
    performancePlugin().setup(buildHub(send), { dsn: "x" });
    callbacks.FCP?.({
      name: "FCP",
      value: -5,
      rating: "good",
      delta: -5,
      id: "v4-f",
      entries: [],
      navigationType: "navigate",
    });
    const event = send.mock.calls[0]?.[0];
    expect(event.value).toBe(0);
    expect(PerformanceEventSchema.safeParse(event).success).toBe(true);
  });

  it("未在白名单的 metric.name（如 FID）被过滤", async () => {
    const { performancePlugin } = await import("./performance.js");
    installNavigationEntry();
    const send = vi.fn().mockResolvedValue(true);
    performancePlugin().setup(buildHub(send), { dsn: "x" });
    // web-vitals v4 不再订阅 FID，但即便第三方绕过传进来也应被过滤
    callbacks.LCP?.({
      name: "FID" as unknown as "LCP",
      value: 10,
      rating: "good",
      delta: 10,
      id: "x",
      entries: [],
      navigationType: "navigate",
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("performancePlugin — Navigation 采集时机", () => {
  it("document.readyState=complete 时立即读 navigation entry", async () => {
    const { performancePlugin } = await import("./performance.js");
    installNavigationEntry();
    Object.defineProperty(document, "readyState", {
      configurable: true,
      get: () => "complete",
    });
    const send = vi.fn().mockResolvedValue(true);
    performancePlugin().setup(buildHub(send), { dsn: "x" });
    callbacks.TTFB?.({
      name: "TTFB",
      value: 50,
      rating: "good",
      delta: 50,
      id: "v4-t",
      entries: [],
      navigationType: "navigate",
    });
    expect(send.mock.calls[0]?.[0].navigation).toBeDefined();
  });

  it("readyState!=complete 时等待 load 事件后再附 navigation", async () => {
    const { performancePlugin } = await import("./performance.js");
    installNavigationEntry();
    Object.defineProperty(document, "readyState", {
      configurable: true,
      get: () => "loading",
    });
    const addEventListener = vi
      .spyOn(window, "addEventListener")
      .mockImplementation(((type: string, cb: EventListener) => {
        if (type === "load") loadListener = cb as () => void;
      }) as typeof window.addEventListener);
    const send = vi.fn().mockResolvedValue(true);
    performancePlugin().setup(buildHub(send), { dsn: "x" });
    expect(addEventListener).toHaveBeenCalledWith(
      "load",
      expect.any(Function),
      { once: true },
    );
    // load 前触发 TTFB，navigation 尚未就绪 → undefined
    callbacks.TTFB?.({
      name: "TTFB",
      value: 50,
      rating: "good",
      delta: 50,
      id: "v4-t",
      entries: [],
      navigationType: "navigate",
    });
    expect(send.mock.calls[0]?.[0].navigation).toBeUndefined();
    // load 触发后再次 TTFB（BFCache 场景），navigation 已读取
    loadListener?.();
    callbacks.TTFB?.({
      name: "TTFB",
      value: 60,
      rating: "good",
      delta: 60,
      id: "v4-t2",
      entries: [],
      navigationType: "navigate",
    });
    expect(send.mock.calls[1]?.[0].navigation).toBeDefined();
  });

  it("reportNavigation=false 时即使 TTFB 也不附 navigation", async () => {
    const { performancePlugin } = await import("./performance.js");
    installNavigationEntry();
    const send = vi.fn().mockResolvedValue(true);
    performancePlugin({ reportNavigation: false }).setup(buildHub(send), {
      dsn: "x",
    });
    callbacks.TTFB?.({
      name: "TTFB",
      value: 50,
      rating: "good",
      delta: 50,
      id: "v4-t",
      entries: [],
      navigationType: "navigate",
    });
    expect(send.mock.calls[0]?.[0].navigation).toBeUndefined();
  });
});

describe("performancePlugin — 降级分支", () => {
  it("PerformanceObserver 不可用时打 warn 且不订阅", async () => {
    const { performancePlugin } = await import("./performance.js");
    const originalPO = globalThis.PerformanceObserver;
    // @ts-expect-error 故意删除做降级测试
    delete globalThis.PerformanceObserver;
    const send = vi.fn().mockResolvedValue(true);
    const hub = buildHub(send);
    const warn = vi.spyOn(hub.logger, "warn").mockImplementation(() => {});
    performancePlugin().setup(hub, { dsn: "x" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(callbacks.LCP).toBeNull();
    globalThis.PerformanceObserver = originalPO;
  });
});
