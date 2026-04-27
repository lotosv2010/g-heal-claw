import { ErrorEventSchema } from "@g-heal-claw/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Hub } from "../hub.js";
import { createLogger } from "../logger.js";
import { errorPlugin } from "./error.js";

/**
 * error.ts 单元测试（ADR-0016 §1）
 *
 * 策略：
 * - 通过 spy 拦截 window.addEventListener，手工抓取 error(bubble)/error(capture)/unhandledrejection 回调
 * - 直接触发回调验证 transport.send 行为；不依赖 jsdom 真正派发 Event
 */

type Handler = (event: Event) => void;

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
    sessionId: "sess-err-1",
    setUser() {},
    setTag() {},
    setContext() {},
    addBreadcrumb() {},
    getScopeSnapshot() {
      return { tags: {}, context: {}, breadcrumbs: [] };
    },
  };
}

/** 抓取按三路（bubble error / capture error / unhandledrejection）注册的 handler */
function installListenerSpy(): {
  errorBubble: Handler | null;
  errorCapture: Handler | null;
  rejection: Handler | null;
} {
  const refs = {
    errorBubble: null as Handler | null,
    errorCapture: null as Handler | null,
    rejection: null as Handler | null,
  };
  vi.spyOn(window, "addEventListener").mockImplementation(((
    type: string,
    cb: EventListener,
    optsOrCapture?: boolean | AddEventListenerOptions,
  ) => {
    const capture =
      typeof optsOrCapture === "boolean"
        ? optsOrCapture
        : (optsOrCapture?.capture ?? false);
    if (type === "error") {
      if (capture) refs.errorCapture = cb as Handler;
      else refs.errorBubble = cb as Handler;
    }
    if (type === "unhandledrejection") refs.rejection = cb as Handler;
  }) as typeof window.addEventListener);
  return refs;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("errorPlugin — JS 异常路径", () => {
  it("冒泡阶段 ErrorEvent 触发后生成 subType=js 事件并通过 Schema", () => {
    const refs = installListenerSpy();
    const send = vi.fn().mockResolvedValue(true);
    errorPlugin().setup(buildHub(send), { dsn: "x" });
    expect(refs.errorBubble).toBeTypeOf("function");

    const err = new Error("Boom");
    refs.errorBubble?.({
      message: "Boom",
      error: err,
      target: window,
    } as unknown as Event);

    expect(send).toHaveBeenCalledTimes(1);
    const event = send.mock.calls[0]?.[0];
    expect(ErrorEventSchema.safeParse(event).success).toBe(true);
    expect(event.subType).toBe("js");
    expect(event.message).toBe("Boom");
    expect(event.stack).toBe(err.stack);
  });

  it("ignoreErrors 字符串命中 → 不上报", () => {
    const refs = installListenerSpy();
    const send = vi.fn().mockResolvedValue(true);
    errorPlugin({ ignoreErrors: ["Script error"] }).setup(buildHub(send), {
      dsn: "x",
    });
    refs.errorBubble?.({
      message: "Script error occurred",
      error: new Error("Script error occurred"),
      target: window,
    } as unknown as Event);
    expect(send).not.toHaveBeenCalled();
  });

  it("ignoreErrors 正则命中 → 不上报", () => {
    const refs = installListenerSpy();
    const send = vi.fn().mockResolvedValue(true);
    errorPlugin({ ignoreErrors: [/ResizeObserver/i] }).setup(buildHub(send), {
      dsn: "x",
    });
    refs.errorBubble?.({
      message: "ResizeObserver loop limit exceeded",
      error: new Error("ResizeObserver loop limit exceeded"),
      target: window,
    } as unknown as Event);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("errorPlugin — Promise rejection 路径", () => {
  it("Error 实例 reason 生成 subType=promise 事件并带 stack", () => {
    const refs = installListenerSpy();
    const send = vi.fn().mockResolvedValue(true);
    errorPlugin().setup(buildHub(send), { dsn: "x" });
    expect(refs.rejection).toBeTypeOf("function");

    const err = new Error("rejected");
    refs.rejection?.({ reason: err } as unknown as Event);

    const event = send.mock.calls[0]?.[0];
    expect(ErrorEventSchema.safeParse(event).success).toBe(true);
    expect(event.subType).toBe("promise");
    expect(event.message).toBe("rejected");
    expect(event.stack).toBe(err.stack);
  });

  it("非 Error reason（纯对象）→ JSON 序列化 message", () => {
    const refs = installListenerSpy();
    const send = vi.fn().mockResolvedValue(true);
    errorPlugin().setup(buildHub(send), { dsn: "x" });
    refs.rejection?.({ reason: { code: 500, msg: "oops" } } as unknown as Event);
    const event = send.mock.calls[0]?.[0];
    expect(event.subType).toBe("promise");
    expect(event.message).toBe('{"code":500,"msg":"oops"}');
    expect(event.stack).toBeUndefined();
  });
});

describe("errorPlugin — 资源错误路径", () => {
  function makeImg(src: string): HTMLElement {
    const img = document.createElement("img");
    img.src = src;
    return img;
  }

  it("<img> 加载失败生成 subType=resource + resource.url/tagName", () => {
    const refs = installListenerSpy();
    const send = vi.fn().mockResolvedValue(true);
    errorPlugin().setup(buildHub(send), { dsn: "x" });
    expect(refs.errorCapture).toBeTypeOf("function");

    const target = makeImg("https://cdn.test/missing.png");
    refs.errorCapture?.({ target } as unknown as Event);

    const event = send.mock.calls[0]?.[0];
    expect(ErrorEventSchema.safeParse(event).success).toBe(true);
    expect(event.subType).toBe("resource");
    expect(event.resource?.tagName).toBe("img");
    expect(event.resource?.url).toBe("https://cdn.test/missing.png");
    expect(event.message).toContain("Resource load failed");
  });

  it("<script> 加载失败 → subType=resource", () => {
    const refs = installListenerSpy();
    const send = vi.fn().mockResolvedValue(true);
    errorPlugin().setup(buildHub(send), { dsn: "x" });
    const script = document.createElement("script");
    script.src = "https://cdn.test/app.js";
    refs.errorCapture?.({ target: script } as unknown as Event);
    expect(send.mock.calls[0]?.[0].subType).toBe("resource");
  });

  it("<link> 加载失败读取 href 作为 url", () => {
    const refs = installListenerSpy();
    const send = vi.fn().mockResolvedValue(true);
    errorPlugin().setup(buildHub(send), { dsn: "x" });
    const link = document.createElement("link");
    link.href = "https://cdn.test/app.css";
    refs.errorCapture?.({ target: link } as unknown as Event);
    const event = send.mock.calls[0]?.[0];
    expect(event.resource?.tagName).toBe("link");
    expect(event.resource?.url).toBe("https://cdn.test/app.css");
  });

  it("captureResource=false 时不注册 capture 监听器", () => {
    const refs = installListenerSpy();
    const send = vi.fn().mockResolvedValue(true);
    errorPlugin({ captureResource: false }).setup(buildHub(send), { dsn: "x" });
    expect(refs.errorCapture).toBeNull();
    expect(refs.errorBubble).toBeTypeOf("function");
  });

  it("同一 Event 冒泡 + 捕获不重复上报（WeakSet 去重）", () => {
    const refs = installListenerSpy();
    const send = vi.fn().mockResolvedValue(true);
    errorPlugin().setup(buildHub(send), { dsn: "x" });
    const target = makeImg("https://cdn.test/dup.png");
    const shared = { target } as unknown as Event;
    // 冒泡路径看到它：target 命中资源标签 → 走 resource 分支
    refs.errorBubble?.(shared);
    // 捕获路径再次看到同一 Event 引用 → seen.has 命中
    refs.errorCapture?.(shared);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("errorPlugin — 降级与边界", () => {
  it("SSR 环境（无 window）静默降级：setup 不抛，transport 不被调用", async () => {
    vi.resetModules();
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    // @ts-expect-error 模拟 SSR
    delete globalThis.window;
    // @ts-expect-error 模拟 SSR
    delete globalThis.document;
    try {
      const { errorPlugin: ssrErrorPlugin } = await import("./error.js");
      const send = vi.fn().mockResolvedValue(true);
      // 重新构造的 hub 也不能访问 window.*
      expect(() => {
        ssrErrorPlugin().setup(
          {
            dsn: {
              protocol: "http",
              publicKey: "pk",
              host: "x",
              projectId: "p",
              ingestUrl: "http://x/ingest",
            },
            options: { dsn: "x", environment: "test", maxBreadcrumbs: 10 },
            logger: createLogger(false),
            transport: {
              name: "mock",
              send,
              async flush() {
                return true;
              },
            },
            scope: { tags: {}, context: {}, breadcrumbs: [] },
            sessionId: "s",
            setUser() {},
            setTag() {},
            setContext() {},
            addBreadcrumb() {},
            getScopeSnapshot() {
              return { tags: {}, context: {}, breadcrumbs: [] };
            },
          } as unknown as Hub,
          { dsn: "x" },
        );
      }).not.toThrow();
      expect(send).not.toHaveBeenCalled();
    } finally {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
    }
  });
});
