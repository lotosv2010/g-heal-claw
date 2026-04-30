import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SdkEvent } from "@g-heal-claw/shared";
import {
  customPlugin,
  track,
  time,
  log,
  __resetCustomPluginForTests,
} from "../../src/plugins/custom.js";
import type { Hub, Scope } from "../../src/hub.js";
import type { Transport } from "../../src/transport/types.js";

/**
 * CustomPlugin 单元测试（ADR-0023 / TM.1.C.1）
 *
 * 覆盖：
 *  - track / time / log 在 setup 后正常产出对应 type 事件
 *  - 未 init / setup 前调用 → 静默丢弃（SSR 降级）
 *  - 幂等 setup：重复 setup 不重置日志计数器
 *  - track：空 name 丢弃；properties 默认 {}
 *  - time：非有限 / 负数 / >24h 丢弃
 *  - log：单会话 200 条硬顶；data >8KB 截断并追加 __truncated 标记
 *  - disabled 插件下所有 API no-op
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

function createSpyTransport(): Transport & { events: SdkEvent[] } {
  const events: SdkEvent[] = [];
  return {
    name: "spy",
    events,
    send: vi.fn(async (event) => {
      events.push(event as SdkEvent);
      return true;
    }),
    flush: vi.fn(async () => true),
  };
}

describe("customPlugin — SSR / 未 init 降级", () => {
  beforeEach(() => __resetCustomPluginForTests());

  it("未 setup 时 track / time / log 全部 no-op", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    // 故意不 setup
    track("should_drop", { a: 1 });
    time("should_drop", 100);
    log("info", "should_drop", { a: 1 });
    expect(transport.send).not.toHaveBeenCalled();
    // 防 hub 未使用的 TS 警告
    expect(hub.sessionId).toBe("sess_test");
  });
});

describe("customPlugin — 基础分发", () => {
  let transport: ReturnType<typeof createSpyTransport>;
  let hub: Hub;

  beforeEach(() => {
    __resetCustomPluginForTests();
    transport = createSpyTransport();
    hub = createStubHub(transport);
    const plugin = customPlugin();
    plugin.setup(hub);
  });

  afterEach(() => __resetCustomPluginForTests());

  it("track 产出 custom_event 事件且 properties 默认为 {}", () => {
    track("cart_add", { sku: "A1", price: 10 });
    track("checkout");

    expect(transport.events).toHaveLength(2);
    const [a, b] = transport.events;
    expect(a.type).toBe("custom_event");
    expect((a as any).name).toBe("cart_add");
    expect((a as any).properties).toEqual({ sku: "A1", price: 10 });
    expect((b as any).name).toBe("checkout");
    expect((b as any).properties).toEqual({});
  });

  it("空 / 空白 name 会被静默丢弃", () => {
    track("");
    track("   ");
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("time 产出 custom_metric 事件", () => {
    time("checkout_time", 1234, { channel: "card" });
    expect(transport.events).toHaveLength(1);
    const evt = transport.events[0] as any;
    expect(evt.type).toBe("custom_metric");
    expect(evt.name).toBe("checkout_time");
    expect(evt.duration).toBe(1234);
    expect(evt.properties).toEqual({ channel: "card" });
  });

  it("time 非有限 / 负 / >24h 被丢弃", () => {
    time("bad_nan", Number.NaN);
    time("bad_infinity", Number.POSITIVE_INFINITY);
    time("bad_neg", -1);
    time("bad_too_large", 24 * 3600 * 1000 + 1);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("log 产出 custom_log 事件且附带 breadcrumbs 快照", () => {
    hub.scope.breadcrumbs.push({
      timestamp: Date.now(),
      category: "ui",
      message: "click",
    });
    log("warn", "payment retry", { orderId: "o_1" });
    expect(transport.events).toHaveLength(1);
    const evt = transport.events[0] as any;
    expect(evt.type).toBe("custom_log");
    expect(evt.level).toBe("warn");
    expect(evt.message).toBe("payment retry");
    expect(evt.data).toEqual({ orderId: "o_1" });
    expect(evt.breadcrumbs).toHaveLength(1);
  });
});

describe("customPlugin — 防日志风暴", () => {
  let transport: ReturnType<typeof createSpyTransport>;

  beforeEach(() => {
    __resetCustomPluginForTests();
    transport = createSpyTransport();
    const hub = createStubHub(transport);
    customPlugin({ maxLogsPerSession: 3, maxLogDataBytes: 64 }).setup(hub);
  });

  afterEach(() => __resetCustomPluginForTests());

  it("单会话日志超过上限静默丢弃", () => {
    log("info", "a");
    log("info", "b");
    log("info", "c");
    log("info", "d"); // 超限
    expect(transport.events).toHaveLength(3);
  });

  it("data 超过字节上限时截断并追加 __truncated 标记", () => {
    const bigPayload = { text: "x".repeat(200) };
    log("error", "boom", bigPayload);
    expect(transport.events).toHaveLength(1);
    const evt = transport.events[0] as any;
    expect(evt.data).toMatchObject({ __truncated: true });
    expect(evt.data.__originalBytes).toBeGreaterThan(64);
    expect(typeof evt.data.__preview).toBe("string");
  });

  it("data 在上限内保持原样", () => {
    log("info", "ok", { a: 1 });
    const evt = transport.events[0] as any;
    expect(evt.data).toEqual({ a: 1 });
  });
});

describe("customPlugin — 幂等 setup 与 disabled", () => {
  beforeEach(() => __resetCustomPluginForTests());
  afterEach(() => __resetCustomPluginForTests());

  it("重复 setup 仅替换 Hub 引用，不重置计数器", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    customPlugin({ maxLogsPerSession: 2 }).setup(hub);
    log("info", "a");
    log("info", "b");
    // 第二次 setup（例如热更新），计数器不应重置
    customPlugin({ maxLogsPerSession: 2 }).setup(hub);
    log("info", "c"); // 超限
    expect(transport.events).toHaveLength(2);
  });

  it("disabled=false 时 setup 不绑定 Hub，API no-op", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);
    customPlugin({ enabled: false }).setup(hub);
    track("x", {});
    time("y", 100);
    log("info", "z");
    expect(transport.send).not.toHaveBeenCalled();
  });
});
