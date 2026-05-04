import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResourceEvent } from "@g-heal-claw/shared";
import {
  resourcePlugin,
  classifyResource,
  judgeFailed,
} from "../../src/plugins/resource.js";
import type { Hub, Scope } from "../../src/hub.js";
import type { Transport } from "../../src/transport/types.js";

/**
 * ResourcePlugin 单元测试（ADR-0022 / TM.1.B）
 *
 * 覆盖：
 *  - 6 类分类矩阵（classifyResource 纯函数）
 *  - failed 判定（judgeFailed 纯函数）
 *  - 黑名单：fetch / xmlhttprequest / beacon 被排除
 *  - PerformanceObserver 不支持 / 不支持 resource entry 的降级
 *  - slow / failed 标记正确
 *  - maxBatch 达阈值立即 flush
 *  - visibilitychange=hidden 兜底 flush
 *  - maxSamplesPerSession 硬顶
 *  - 幂等 setup（同一 hub 只订阅一次）
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface FakeResourceEntry extends PerformanceResourceTiming {
  // 已由 PerformanceResourceTiming 覆盖所有字段
}

function makeEntry(params: {
  name: string;
  initiatorType: string;
  duration?: number;
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
  responseStart?: number;
  startTime?: number;
  nextHopProtocol?: string;
}): FakeResourceEntry {
  return {
    name: params.name,
    entryType: "resource",
    startTime: params.startTime ?? 100,
    duration: params.duration ?? 200,
    initiatorType: params.initiatorType,
    transferSize: params.transferSize ?? 1024,
    encodedBodySize: params.encodedBodySize ?? 1024,
    decodedBodySize: params.decodedBodySize ?? 2048,
    responseStart: params.responseStart ?? 50,
    nextHopProtocol: params.nextHopProtocol ?? "h2",
    toJSON: () => ({}),
  } as unknown as FakeResourceEntry;
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

function createSpyTransport(): Transport & { events: ResourceEvent[] } {
  const events: ResourceEvent[] = [];
  return {
    name: "spy",
    events,
    send: vi.fn(async (event) => {
      events.push(event as ResourceEvent);
      return true;
    }),
    flush: vi.fn(async () => true),
  };
}

describe("classifyResource 纯函数", () => {
  it("script initiatorType → script", () => {
    expect(classifyResource("script", "https://cdn.example.com/a.js")).toBe(
      "script",
    );
  });

  it("img / imageset → image", () => {
    expect(classifyResource("img", "https://x.com/a.png")).toBe("image");
    expect(classifyResource("imageset", "https://x.com/a.png")).toBe("image");
  });

  it("audio / video → media", () => {
    expect(classifyResource("audio", "https://x.com/a.mp3")).toBe("media");
    expect(classifyResource("video", "https://x.com/a.mp4")).toBe("media");
  });

  it("font initiatorType → font", () => {
    expect(classifyResource("font", "https://x.com/a.woff2")).toBe("font");
  });

  it("css initiatorType + .css 扩展 → stylesheet", () => {
    expect(classifyResource("css", "https://x.com/style.css")).toBe(
      "stylesheet",
    );
  });

  it("css initiatorType + 字体扩展 → font（@font-face 兜底）", () => {
    expect(classifyResource("css", "https://x.com/font.woff2")).toBe("font");
    expect(classifyResource("css", "https://x.com/font.ttf?v=1")).toBe("font");
  });

  it("link initiatorType → stylesheet", () => {
    expect(classifyResource("link", "https://x.com/style.css")).toBe(
      "stylesheet",
    );
  });

  it("未知 initiatorType → other", () => {
    expect(classifyResource("weird", "https://x.com/a.bin")).toBe("other");
  });
});

describe("judgeFailed 纯函数", () => {
  it("transferSize/decodedSize/responseStart 全零 → failed=true", () => {
    expect(
      judgeFailed({
        transferSize: 0,
        decodedBodySize: 0,
        responseStart: 0,
        duration: 50,
      } as PerformanceResourceTiming),
    ).toBe(true);
  });

  it("duration=0 → failed=true", () => {
    expect(
      judgeFailed({
        transferSize: 100,
        decodedBodySize: 100,
        responseStart: 10,
        duration: 0,
      } as PerformanceResourceTiming),
    ).toBe(true);
  });

  it("正常样本 → failed=false", () => {
    expect(
      judgeFailed({
        transferSize: 1024,
        decodedBodySize: 2048,
        responseStart: 50,
        duration: 200,
      } as PerformanceResourceTiming),
    ).toBe(false);
  });
});

describe("resourcePlugin / 环境降级", () => {
  const OriginalPO = window.PerformanceObserver;

  afterEach(() => {
    (
      window as unknown as { PerformanceObserver: unknown }
    ).PerformanceObserver = OriginalPO;
  });

  it("无 PerformanceObserver → no-op 不抛错", () => {
    (
      window as unknown as { PerformanceObserver: unknown }
    ).PerformanceObserver = undefined;
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    expect(() => resourcePlugin().setup(hub, { dsn: "" })).not.toThrow();
    expect(transport.events).toHaveLength(0);
  });

  it("supportedEntryTypes 不含 resource → no-op", () => {
    (
      window as unknown as { PerformanceObserver: unknown }
    ).PerformanceObserver = class {
      static supportedEntryTypes: readonly string[] = ["paint"];
      observe() {}
      disconnect() {}
    };
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    resourcePlugin().setup(hub, { dsn: "" });
    expect(transport.events).toHaveLength(0);
  });
});

describe("resourcePlugin / 采集", () => {
  type Callback = (list: {
    getEntries: () => readonly FakeResourceEntry[];
  }) => void;
  let capturedCallback: Callback | null;
  const OriginalPO = window.PerformanceObserver;

  beforeEach(() => {
    capturedCallback = null;
    (
      window as unknown as { PerformanceObserver: unknown }
    ).PerformanceObserver = class {
      static supportedEntryTypes: readonly string[] = ["resource"];
      constructor(cb: Callback) {
        capturedCallback = cb;
      }
      observe() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    (
      window as unknown as { PerformanceObserver: unknown }
    ).PerformanceObserver = OriginalPO;
  });

  function emit(entries: FakeResourceEntry[]): void {
    if (!capturedCallback) throw new Error("PO callback 未捕获");
    capturedCallback({ getEntries: () => entries });
  }

  it("script / image 正常采集，category + host + duration 正确", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    resourcePlugin({ maxBatch: 1 }).setup(hub, { dsn: "" });

    emit([
      makeEntry({
        name: "https://cdn.example.com/a.js",
        initiatorType: "script",
        duration: 120,
      }),
      makeEntry({
        name: "https://img.example.com/a.png",
        initiatorType: "img",
        duration: 80,
      }),
    ]);

    expect(transport.events).toHaveLength(2);
    const [s, i] = transport.events;
    expect(s.category).toBe("script");
    expect(s.host).toBe("cdn.example.com");
    expect(s.duration).toBe(120);
    expect(i.category).toBe("image");
    expect(i.host).toBe("img.example.com");
  });

  it("initiatorType in {fetch, xmlhttprequest, beacon} → 不采集（与 apiPlugin 避重）", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    resourcePlugin({ maxBatch: 1 }).setup(hub, { dsn: "" });

    emit([
      makeEntry({
        name: "https://api.example.com/users",
        initiatorType: "fetch",
      }),
      makeEntry({
        name: "https://api.example.com/posts",
        initiatorType: "xmlhttprequest",
      }),
      makeEntry({
        name: "https://api.example.com/beacon",
        initiatorType: "beacon",
      }),
    ]);

    expect(transport.events).toHaveLength(0);
  });

  it("duration > slowThresholdMs → slow=true / failed=false", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    resourcePlugin({ slowThresholdMs: 100, maxBatch: 1 }).setup(hub, {
      dsn: "",
    });

    emit([
      makeEntry({
        name: "https://x.com/slow.js",
        initiatorType: "script",
        duration: 300,
      }),
    ]);

    expect(transport.events[0].slow).toBe(true);
    expect(transport.events[0].failed).toBe(false);
  });

  it("RT 全零 → failed=true / slow=false（failed 优先）", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    resourcePlugin({ slowThresholdMs: 10, maxBatch: 1 }).setup(hub, {
      dsn: "",
    });

    emit([
      makeEntry({
        name: "https://x.com/404.js",
        initiatorType: "script",
        duration: 50,
        transferSize: 0,
        decodedBodySize: 0,
        responseStart: 0,
      }),
    ]);

    expect(transport.events[0].failed).toBe(true);
    expect(transport.events[0].slow).toBe(false);
  });

  it("ignoreUrls 命中 → 不上报", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    resourcePlugin({
      ignoreUrls: [/\/tracker\//],
      maxBatch: 1,
    }).setup(hub, { dsn: "" });

    emit([
      makeEntry({
        name: "https://x.com/tracker/log.js",
        initiatorType: "script",
      }),
    ]);

    expect(transport.events).toHaveLength(0);
  });

  it("maxBatch 达阈值立即 flush", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    resourcePlugin({ maxBatch: 3 }).setup(hub, { dsn: "" });

    emit([
      makeEntry({ name: "https://x.com/a.js", initiatorType: "script" }),
      makeEntry({ name: "https://x.com/b.js", initiatorType: "script" }),
      makeEntry({ name: "https://x.com/c.js", initiatorType: "script" }),
    ]);

    expect(transport.events).toHaveLength(3);
  });

  it("visibilitychange=hidden → flush 残留 buffer", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    resourcePlugin({ maxBatch: 100 }).setup(hub, { dsn: "" });

    emit([
      makeEntry({ name: "https://x.com/a.js", initiatorType: "script" }),
      makeEntry({ name: "https://x.com/b.css", initiatorType: "css" }),
    ]);
    expect(transport.events).toHaveLength(0);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(transport.events).toHaveLength(2);
  });

  it("maxSamplesPerSession 命中硬顶 → 超出部分丢弃", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    resourcePlugin({ maxBatch: 1, maxSamplesPerSession: 2 }).setup(hub, {
      dsn: "",
    });

    emit([
      makeEntry({ name: "https://x.com/1.js", initiatorType: "script" }),
      makeEntry({ name: "https://x.com/2.js", initiatorType: "script" }),
      makeEntry({ name: "https://x.com/3.js", initiatorType: "script" }),
      makeEntry({ name: "https://x.com/4.js", initiatorType: "script" }),
    ]);

    expect(transport.events).toHaveLength(2);
  });

  it("幂等 setup：重复 setup 同一 hub 不重复订阅", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    resourcePlugin({ maxBatch: 1 }).setup(hub, { dsn: "" });
    // 重复 setup：第二次应被守卫跳过，capturedCallback 不应被覆盖为新的实例
    const firstCallback = capturedCallback;
    resourcePlugin({ maxBatch: 1 }).setup(hub, { dsn: "" });
    expect(capturedCallback).toBe(firstCallback);

    emit([
      makeEntry({ name: "https://x.com/a.js", initiatorType: "script" }),
    ]);

    expect(transport.events).toHaveLength(1);
  });

  it("encoded/decoded/transferSize 填充到事件体", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    resourcePlugin({ maxBatch: 1 }).setup(hub, { dsn: "" });

    emit([
      makeEntry({
        name: "https://x.com/a.js",
        initiatorType: "script",
        transferSize: 500,
        encodedBodySize: 400,
        decodedBodySize: 1200,
      }),
    ]);

    const evt = transport.events[0];
    expect(evt.transferSize).toBe(500);
    expect(evt.encodedSize).toBe(400);
    expect(evt.decodedSize).toBe(1200);
    expect(evt.cache).toBe("miss");
    expect(evt.protocol).toBe("h2");
  });

  it("transferSize=0 + decodedBodySize>0 → cache=hit", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    resourcePlugin({ maxBatch: 1 }).setup(hub, { dsn: "" });

    emit([
      makeEntry({
        name: "https://x.com/cached.js",
        initiatorType: "script",
        transferSize: 0,
        encodedBodySize: 0,
        decodedBodySize: 2048,
        responseStart: 5,
      }),
    ]);

    expect(transport.events[0].cache).toBe("hit");
    expect(transport.events[0].failed).toBe(false);
  });
});
