import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEvent } from "@g-heal-claw/shared";
import { apiPlugin } from "../../src/plugins/api.js";
import type { Hub, Scope } from "../../src/hub.js";
import type { Transport } from "../../src/transport/types.js";

/**
 * ApiPlugin 单元测试（ADR-0020 §4.1）
 *
 * 覆盖：
 *  - fetch 成功 200 → type='api' / failed=false / slow 基于阈值
 *  - fetch 非 2xx → failed=true
 *  - fetch 抛错 → status=0 / failed=true / errorMessage 填充并继续抛出
 *  - 慢请求阈值：duration >= threshold → slow=true
 *  - ignoreUrls / SDK 自身 ingest 过滤（不上报）
 *  - XHR 成功 / onerror → failed 正确
 *  - 双重 setup 不重复 patch（__ghcApiPatched 守卫）
 *  - requestSize / responseSize 填充（Content-Length）
 */

interface StubFetch {
  readonly status: number;
  readonly contentType?: string;
  readonly contentLength?: string;
  readonly body?: string;
  readonly throws?: Error;
  /** 模拟请求耗时 */
  readonly delayMs?: number;
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

function createSpyTransport(): Transport & { events: ApiEvent[] } {
  const events: ApiEvent[] = [];
  return {
    name: "spy",
    events,
    send: vi.fn(async (event) => {
      events.push(event as ApiEvent);
      return true;
    }),
    flush: vi.fn(async () => true),
  };
}

describe("apiPlugin / fetch", () => {
  let originalFetch: typeof fetch | undefined;

  beforeEach(() => {
    originalFetch = window.fetch;
  });

  afterEach(() => {
    if (originalFetch) window.fetch = originalFetch;
    else delete (window as { fetch?: typeof fetch }).fetch;
  });

  function installStubFetch(stub: StubFetch): void {
    window.fetch = vi.fn(async (): Promise<Response> => {
      if (stub.delayMs) await new Promise((r) => setTimeout(r, stub.delayMs));
      if (stub.throws) throw stub.throws;
      const headers = new Headers();
      if (stub.contentType) headers.set("content-type", stub.contentType);
      if (stub.contentLength) headers.set("content-length", stub.contentLength);
      return new Response(stub.body ?? "", {
        status: stub.status,
        headers,
      });
    }) as typeof fetch;
  }

  it("成功 200 → type='api' / failed=false / status 填充", async () => {
    installStubFetch({ status: 200, body: "ok" });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    apiPlugin().setup(hub, { dsn: "" });

    await window.fetch("https://api.example.com/users");

    expect(transport.events).toHaveLength(1);
    const evt = transport.events[0];
    expect(evt.type).toBe("api");
    expect(evt.status).toBe(200);
    expect(evt.failed).toBe(false);
    expect(evt.method).toBe("GET");
    expect(evt.url).toBe("https://api.example.com/users");
  });

  it("非 2xx → failed=true", async () => {
    installStubFetch({ status: 500 });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    apiPlugin().setup(hub, { dsn: "" });

    await window.fetch("https://api.example.com/err");

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].failed).toBe(true);
    expect(transport.events[0].status).toBe(500);
  });

  it("fetch 抛错 → status=0 / failed=true / 继续抛出", async () => {
    installStubFetch({ status: 0, throws: new Error("offline") });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    apiPlugin().setup(hub, { dsn: "" });

    await expect(
      window.fetch("https://api.example.com/x"),
    ).rejects.toThrow("offline");

    expect(transport.events).toHaveLength(1);
    const evt = transport.events[0];
    expect(evt.status).toBe(0);
    expect(evt.failed).toBe(true);
    expect(evt.errorMessage).toBe("offline");
  });

  it("duration >= slowThresholdMs → slow=true", async () => {
    installStubFetch({ status: 200, delayMs: 30 });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    apiPlugin({ slowThresholdMs: 10 }).setup(hub, { dsn: "" });

    await window.fetch("https://api.example.com/slow");

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].slow).toBe(true);
  });

  it("ignoreUrls 命中 → 不上报", async () => {
    installStubFetch({ status: 500 });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    apiPlugin({ ignoreUrls: [/\/tracker\//] }).setup(hub, { dsn: "" });

    await window.fetch("https://api.example.com/tracker/log");

    expect(transport.events).toHaveLength(0);
  });

  it("SDK 自身 ingest URL → 不上报，防雪崩", async () => {
    installStubFetch({ status: 500 });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    apiPlugin().setup(hub, { dsn: "" });

    await window.fetch("http://localhost:3001/ingest/v1/events");

    expect(transport.events).toHaveLength(0);
  });

  it("Content-Length 头 → responseSize 填充", async () => {
    installStubFetch({ status: 200, contentLength: "128" });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    apiPlugin().setup(hub, { dsn: "" });

    await window.fetch("https://api.example.com/sized");

    expect(transport.events[0].responseSize).toBe(128);
  });

  it("请求体为 string → requestSize 以 UTF-8 字节数填充", async () => {
    installStubFetch({ status: 200 });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    apiPlugin().setup(hub, { dsn: "" });

    await window.fetch("https://api.example.com/post", {
      method: "POST",
      body: "hello",
    });

    expect(transport.events[0].requestSize).toBe(5);
    expect(transport.events[0].method).toBe("POST");
  });

  it("双重 setup 不重复 patch（__ghcApiPatched 守卫）", async () => {
    installStubFetch({ status: 200 });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    apiPlugin().setup(hub, { dsn: "" });
    apiPlugin().setup(hub, { dsn: "" });

    await window.fetch("https://api.example.com/x");

    expect(transport.events).toHaveLength(1);
  });
});

describe("apiPlugin / XHR", () => {
  let originalSend: typeof XMLHttpRequest.prototype.send;

  beforeEach(() => {
    originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function noopSend() {
      /* no-op，避免 jsdom 真实发请求 */
    } as typeof XMLHttpRequest.prototype.send;
    const proto = XMLHttpRequest.prototype as unknown as {
      __ghcApiPatched?: boolean;
    };
    delete proto.__ghcApiPatched;
  });

  afterEach(() => {
    XMLHttpRequest.prototype.send = originalSend;
    const proto = XMLHttpRequest.prototype as unknown as {
      __ghcApiPatched?: boolean;
    };
    delete proto.__ghcApiPatched;
  });

  it("XHR 200 load → failed=false", async () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    apiPlugin().setup(hub, { dsn: "" });

    const xhr = new XMLHttpRequest();
    xhr.open("GET", "https://api.example.com/ok");
    xhr.send();
    Object.defineProperty(xhr, "status", { value: 200, configurable: true });
    xhr.dispatchEvent(new Event("load"));

    await Promise.resolve();

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].status).toBe(200);
    expect(transport.events[0].failed).toBe(false);
  });

  it("XHR 404 load → failed=true（status>=400）", async () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    apiPlugin().setup(hub, { dsn: "" });

    const xhr = new XMLHttpRequest();
    xhr.open("GET", "https://api.example.com/nope");
    xhr.send();
    Object.defineProperty(xhr, "status", { value: 404, configurable: true });
    xhr.dispatchEvent(new Event("load"));

    await Promise.resolve();

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].failed).toBe(true);
    expect(transport.events[0].status).toBe(404);
  });

  it("XHR onerror → status=0 / failed=true / errorMessage='network error'", async () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    apiPlugin().setup(hub, { dsn: "" });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://api.example.com/boom");
    xhr.send();
    xhr.dispatchEvent(new Event("error"));

    await Promise.resolve();

    expect(transport.events).toHaveLength(1);
    const evt = transport.events[0];
    expect(evt.status).toBe(0);
    expect(evt.failed).toBe(true);
    expect(evt.errorMessage).toBe("network error");
    expect(evt.method).toBe("POST");
  });
});
