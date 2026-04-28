import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent as GhcErrorEvent } from "@g-heal-claw/shared";
import { errorPlugin } from "../../src/plugins/error.js";
import type { Hub, Scope } from "../../src/hub.js";
import type { Transport } from "../../src/transport/types.js";

/**
 * ErrorPlugin 单元测试（ADR-0016 + ADR-0019）
 *
 * 覆盖：
 *  - JS 异常（window.error 冒泡）
 *  - Promise rejection（Error / 字符串 / 对象）
 *  - 资源 4 分类（IMG / SCRIPT / LINK / AUDIO|VIDEO） → resource.kind 归一
 *  - WeakSet 冒泡+捕获双订阅去重
 *  - ignoreErrors 过滤
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

function createSpyTransport(): Transport & { events: GhcErrorEvent[] } {
  const events: GhcErrorEvent[] = [];
  return {
    name: "spy",
    events,
    send: vi.fn(async (event) => {
      events.push(event as GhcErrorEvent);
      return true;
    }),
    flush: vi.fn(async () => true),
  };
}

describe("errorPlugin / JS 异常", () => {
  let transport: Transport & { events: GhcErrorEvent[] };
  let hub: Hub;
  let listeners: Array<[string, EventListener, boolean]>;
  let originalAdd: typeof window.addEventListener;

  beforeEach(() => {
    transport = createSpyTransport();
    hub = createStubHub(transport);
    listeners = [];
    // 拦截 addEventListener 以便测试中手动触发
    originalAdd = window.addEventListener.bind(window);
    window.addEventListener = ((
      type: string,
      listener: EventListener,
      options?: boolean | AddEventListenerOptions,
    ) => {
      const capture =
        typeof options === "boolean" ? options : (options?.capture ?? false);
      listeners.push([type, listener, capture]);
      return originalAdd(type, listener, options);
    }) as typeof window.addEventListener;
  });

  afterEach(() => {
    window.addEventListener = originalAdd;
  });

  it("ErrorEvent → 上报 subType=js，解析 message + stack", () => {
    errorPlugin().setup(hub, { dsn: "" });

    const err = new Error("boom");
    const evt = new window.ErrorEvent("error", {
      message: "boom",
      error: err,
    });
    // 只取冒泡（非 capture）的 listener
    const bubbling = listeners.find(([t, , c]) => t === "error" && !c);
    expect(bubbling).toBeDefined();
    bubbling![1](evt);

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].subType).toBe("js");
    expect(transport.events[0].message).toBe("boom");
  });

  it("ignoreErrors 命中子串 → 不上报", () => {
    errorPlugin({ ignoreErrors: ["ResizeObserver"] }).setup(hub, { dsn: "" });

    const evt = new window.ErrorEvent("error", {
      message: "ResizeObserver loop limit exceeded",
      error: new Error("ResizeObserver loop limit exceeded"),
    });
    const bubbling = listeners.find(([t, , c]) => t === "error" && !c);
    bubbling![1](evt);

    expect(transport.events).toHaveLength(0);
  });

  it("WeakSet 去重：冒泡 + 捕获重复触发同一事件仅上报一次", () => {
    errorPlugin().setup(hub, { dsn: "" });

    const evt = new window.ErrorEvent("error", {
      message: "dup",
      error: new Error("dup"),
    });
    const bubbling = listeners.find(([t, , c]) => t === "error" && !c);
    const capturing = listeners.find(([t, , c]) => t === "error" && c);
    expect(bubbling).toBeDefined();
    expect(capturing).toBeDefined();

    bubbling![1](evt);
    capturing![1](evt);

    expect(transport.events).toHaveLength(1);
  });
});

describe("errorPlugin / Promise rejection", () => {
  let transport: Transport & { events: GhcErrorEvent[] };
  let hub: Hub;
  let rejectionListener: EventListener | undefined;
  let originalAdd: typeof window.addEventListener;

  beforeEach(() => {
    transport = createSpyTransport();
    hub = createStubHub(transport);
    rejectionListener = undefined;
    originalAdd = window.addEventListener.bind(window);
    window.addEventListener = ((
      type: string,
      listener: EventListener,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === "unhandledrejection") rejectionListener = listener;
      return originalAdd(type, listener, options);
    }) as typeof window.addEventListener;
    errorPlugin().setup(hub, { dsn: "" });
  });

  afterEach(() => {
    window.addEventListener = originalAdd;
  });

  it("Error reason → subType=promise, 带 stack", () => {
    const reason = new Error("async fail");
    const evt = {
      reason,
      promise: Promise.reject(reason).catch(() => {}),
    } as unknown as PromiseRejectionEvent;
    rejectionListener!(evt);

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].subType).toBe("promise");
    expect(transport.events[0].message).toBe("async fail");
  });

  it("字符串 reason → subType=promise, 无 stack", () => {
    const evt = {
      reason: "plain string",
      promise: Promise.resolve(),
    } as unknown as PromiseRejectionEvent;
    rejectionListener!(evt);

    expect(transport.events[0].subType).toBe("promise");
    expect(transport.events[0].message).toBe("plain string");
    expect(transport.events[0].stack).toBeUndefined();
  });
});

describe("errorPlugin / 资源 4 分类", () => {
  let transport: Transport & { events: GhcErrorEvent[] };
  let hub: Hub;
  let captureListener: EventListener | undefined;
  let originalAdd: typeof window.addEventListener;

  beforeEach(() => {
    transport = createSpyTransport();
    hub = createStubHub(transport);
    captureListener = undefined;
    originalAdd = window.addEventListener.bind(window);
    window.addEventListener = ((
      type: string,
      listener: EventListener,
      options?: boolean | AddEventListenerOptions,
    ) => {
      const capture =
        typeof options === "boolean" ? options : (options?.capture ?? false);
      if (type === "error" && capture) captureListener = listener;
      return originalAdd(type, listener, options);
    }) as typeof window.addEventListener;
    errorPlugin().setup(hub, { dsn: "" });
  });

  afterEach(() => {
    window.addEventListener = originalAdd;
  });

  function fireResource(
    tag: "IMG" | "SCRIPT" | "LINK" | "VIDEO" | "AUDIO",
    url: string,
  ): void {
    const el = document.createElement(tag.toLowerCase()) as HTMLElement & {
      src?: string;
      href?: string;
    };
    if (tag === "LINK") (el as HTMLLinkElement).href = url;
    else (el as HTMLImageElement).src = url;
    const evt = new Event("error");
    Object.defineProperty(evt, "target", { value: el, configurable: true });
    captureListener!(evt);
  }

  it("IMG → resource.kind=image_load", () => {
    fireResource("IMG", "https://cdn.example.com/a.png");
    expect(transport.events[0].subType).toBe("resource");
    expect(transport.events[0].resource?.kind).toBe("image_load");
  });

  it("SCRIPT → resource.kind=js_load", () => {
    fireResource("SCRIPT", "https://cdn.example.com/a.js");
    expect(transport.events[0].resource?.kind).toBe("js_load");
  });

  it("LINK[href=*.css] → resource.kind=css_load", () => {
    fireResource("LINK", "https://cdn.example.com/a.css");
    expect(transport.events[0].resource?.kind).toBe("css_load");
  });

  it("VIDEO → resource.kind=media", () => {
    fireResource("VIDEO", "https://cdn.example.com/a.mp4");
    expect(transport.events[0].resource?.kind).toBe("media");
  });
});
