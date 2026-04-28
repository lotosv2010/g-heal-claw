import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent as GhcErrorEvent } from "@g-heal-claw/shared";
import { httpPlugin } from "../../src/plugins/http.js";
import type { Hub, Scope } from "../../src/hub.js";
import type { Transport } from "../../src/transport/types.js";

/**
 * HttpPlugin 单元测试（ADR-0019）
 *
 * 覆盖：
 *  - fetch：成功 2xx JSON 业务码成功/失败、非 2xx、异常抛错
 *  - XHR：onerror / 404 / 业务码异常
 *  - ignoreUrls、SDK 自身 ingest 过滤
 *  - 双重 patch 保护（__ghcPatched）
 */

interface StubFetch {
  ok: boolean;
  status: number;
  statusText?: string;
  contentType?: string;
  body?: string;
  throws?: Error;
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

describe("httpPlugin / fetch", () => {
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
      if (stub.throws) throw stub.throws;
      const headers = new Headers();
      if (stub.contentType) headers.set("content-type", stub.contentType);
      return new Response(stub.body ?? "", {
        status: stub.status,
        statusText: stub.statusText,
        headers,
      });
    }) as typeof fetch;
  }

  it("2xx JSON 业务 code=0 视为成功，不上报", async () => {
    installStubFetch({
      ok: true,
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 0, data: {} }),
    });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    httpPlugin().setup(hub, { dsn: "" });

    await window.fetch("https://api.example.com/users");

    expect(transport.events).toHaveLength(0);
  });

  it("2xx JSON 业务 code!=0 → 上报 api_code", async () => {
    installStubFetch({
      ok: true,
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 500, message: "biz fail" }),
    });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    httpPlugin().setup(hub, { dsn: "" });

    await window.fetch("https://api.example.com/order", { method: "POST" });

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].subType).toBe("api_code");
    expect(transport.events[0].request?.status).toBe(200);
    expect(transport.events[0].request?.bizCode).toBe(500);
    expect(transport.events[0].request?.method).toBe("POST");
  });

  it("非 2xx 响应 → 上报 ajax", async () => {
    installStubFetch({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    httpPlugin().setup(hub, { dsn: "" });

    await window.fetch("https://api.example.com/missing");

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].subType).toBe("ajax");
    expect(transport.events[0].request?.status).toBe(404);
  });

  it("fetch 抛错 → 上报 ajax status=0", async () => {
    installStubFetch({ ok: false, status: 0, throws: new Error("offline") });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    httpPlugin().setup(hub, { dsn: "" });

    await expect(
      window.fetch("https://api.example.com/x"),
    ).rejects.toThrow("offline");

    expect(transport.events).toHaveLength(1);
    expect(transport.events[0].subType).toBe("ajax");
    expect(transport.events[0].request?.status).toBe(0);
  });

  it("非 JSON 响应 → 不解析业务 code", async () => {
    installStubFetch({
      ok: true,
      status: 200,
      contentType: "text/html",
      body: "<html>ok</html>",
    });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    httpPlugin().setup(hub, { dsn: "" });

    await window.fetch("https://cdn.example.com/index.html");

    expect(transport.events).toHaveLength(0);
  });

  it("ignoreUrls 命中 → 不上报", async () => {
    installStubFetch({ ok: false, status: 500 });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    httpPlugin({ ignoreUrls: [/\/tracker\//] }).setup(hub, { dsn: "" });

    await window.fetch("https://api.example.com/tracker/log");

    expect(transport.events).toHaveLength(0);
  });

  it("SDK 自身 ingest URL → 不上报，避免雪崩", async () => {
    installStubFetch({ ok: false, status: 500 });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    httpPlugin().setup(hub, { dsn: "" });

    await window.fetch("http://localhost:3001/ingest/v1/events");

    expect(transport.events).toHaveLength(0);
  });

  it("双重 setup 不会重复 patch", async () => {
    installStubFetch({ ok: false, status: 404 });
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    httpPlugin().setup(hub, { dsn: "" });
    httpPlugin().setup(hub, { dsn: "" });

    await window.fetch("https://api.example.com/x");

    // 只上报一次（若重复 patch 会双倍）
    expect(transport.events).toHaveLength(1);
  });
});

describe("httpPlugin / XHR", () => {
  /**
   * jsdom 的 XHR send() 会真的发起内部网络请求并重置只读属性；
   * 为避免耦合 jsdom 实现，这里把 prototype.send 替换为仅"注册在 test
   * 钩子里"的空实现（httpPlugin patch 之前），再让插件在其上注册监听。
   */
  let originalSend: typeof XMLHttpRequest.prototype.send;

  beforeEach(() => {
    originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function noopSend() {
      /* no-op */
    } as typeof XMLHttpRequest.prototype.send;
    // 清除插件双重 patch 保护，允许每次测试重新 patch 到新的 hub
    const proto = XMLHttpRequest.prototype as unknown as {
      __ghcPatched?: boolean;
    };
    delete proto.__ghcPatched;
  });

  afterEach(() => {
    XMLHttpRequest.prototype.send = originalSend;
    const proto = XMLHttpRequest.prototype as unknown as {
      __ghcPatched?: boolean;
    };
    delete proto.__ghcPatched;
  });

  it("XHR 404 → 上报 ajax", async () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    httpPlugin().setup(hub, { dsn: "" });

    const xhr = new XMLHttpRequest();
    xhr.open("GET", "https://api.example.com/nope");
    xhr.send();
    // send 后再定义只读属性，确保事件回调读到预期 status
    Object.defineProperty(xhr, "status", { value: 404, configurable: true });
    Object.defineProperty(xhr, "statusText", {
      value: "Not Found",
      configurable: true,
    });
    xhr.dispatchEvent(new Event("load"));

    await Promise.resolve();

    const ajax = transport.events.find((e) => e.subType === "ajax");
    expect(ajax).toBeDefined();
    expect(ajax?.request?.status).toBe(404);
  });

  it("XHR onerror → 上报 ajax status=0", async () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    httpPlugin().setup(hub, { dsn: "" });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://api.example.com/fail");
    xhr.send();
    xhr.dispatchEvent(new Event("error"));

    await Promise.resolve();

    const ajax = transport.events.find(
      (e) => e.subType === "ajax" && e.request?.status === 0,
    );
    expect(ajax).toBeDefined();
    expect(ajax?.request?.method).toBe("POST");
  });
});
