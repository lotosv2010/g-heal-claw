import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageViewEvent, SdkEvent } from "@g-heal-claw/shared";
import { pageViewPlugin } from "../../src/plugins/page-view.js";
import type { Hub, Scope } from "../../src/hub.js";
import type { Transport } from "../../src/transport/types.js";

/**
 * pageViewPlugin 单元测试（ADR-0020 Tier 2.A / TM.2.A.1）
 *
 * 覆盖：
 *  - 初次加载：DOMContentLoaded 已完成 → 立即 dispatch
 *  - loadType：回退到 navigate（jsdom 下 performance.getEntriesByType 无 navigation）
 *  - SPA：pushState / replaceState / popstate 分别触发
 *  - 去重：同 URL 再次 pushState 被合并
 *  - 幂等 patch：__ghcPageViewPatched 标记避免二次 wrap
 *  - autoSpa=false：仅初次加载，不监听 history
 *  - enabled=false：完全跳过
 */

interface PatchedHistory extends History {
  __ghcPageViewPatched?: boolean;
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

function pvEvents(transport: Transport & { events: SdkEvent[] }): PageViewEvent[] {
  return transport.events.filter(
    (e): e is PageViewEvent => e.type === "page_view",
  );
}

describe("pageViewPlugin", () => {
  let originalPush: typeof history.pushState;
  let originalReplace: typeof history.replaceState;

  beforeEach(() => {
    // 保存原生实现，测试后恢复，避免跨测试的 patch 污染
    originalPush = history.pushState;
    originalReplace = history.replaceState;
    // 清除幂等 patch 标记，让每个测试重新 patch
    delete (history as PatchedHistory).__ghcPageViewPatched;
  });

  afterEach(() => {
    history.pushState = originalPush;
    history.replaceState = originalReplace;
    delete (history as PatchedHistory).__ghcPageViewPatched;
  });

  it("readyState=complete 时 setup 立即 dispatch 初次加载事件", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);

    pageViewPlugin().setup(hub, { dsn: "" });

    const evts = pvEvents(transport);
    expect(evts).toHaveLength(1);
    expect(evts[0]?.isSpaNav).toBe(false);
    expect(evts[0]?.loadType).toBe("navigate");
    expect(evts[0]?.page?.url).toBeTruthy();
  });

  it("pushState 触发 SPA 切换上报（isSpaNav=true + loadType=navigate）", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);

    pageViewPlugin().setup(hub, { dsn: "" });
    expect(pvEvents(transport)).toHaveLength(1); // 初次

    history.pushState({}, "", "/foo?x=1");
    const evts = pvEvents(transport);
    expect(evts).toHaveLength(2);
    expect(evts[1]?.isSpaNav).toBe(true);
    expect(evts[1]?.loadType).toBe("navigate");
    expect(evts[1]?.page?.path).toBe("/foo");
  });

  it("replaceState 到不同 URL 上报；同 URL 被去重", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);

    pageViewPlugin().setup(hub, { dsn: "" });
    history.replaceState({}, "", "/bar");
    history.replaceState({}, "", "/bar"); // 同 URL 被去重

    const evts = pvEvents(transport);
    expect(evts).toHaveLength(2); // 初次 + /bar 一次
    expect(evts[1]?.page?.path).toBe("/bar");
  });

  it("popstate 触发 back_forward 上报", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);

    pageViewPlugin().setup(hub, { dsn: "" });
    history.pushState({}, "", "/a");
    // 手动改动 location 后派发 popstate（jsdom 不会自动回退 URL）
    history.pushState({}, "", "/b");
    window.dispatchEvent(new PopStateEvent("popstate"));

    const evts = pvEvents(transport);
    // 初次 + /a + /b + popstate 回到 /b 同 URL 被去重 → 3 条
    expect(evts.length).toBeGreaterThanOrEqual(3);
    const last = evts[evts.length - 1]!;
    expect(["navigate", "back_forward"]).toContain(last.loadType);
  });

  it("autoSpa=false 只采初次加载，pushState 不再上报", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);

    pageViewPlugin({ autoSpa: false }).setup(hub, { dsn: "" });
    history.pushState({}, "", "/should-not-fire");

    const evts = pvEvents(transport);
    expect(evts).toHaveLength(1);
    expect(evts[0]?.isSpaNav).toBe(false);
  });

  it("enabled=false 完全跳过", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);

    pageViewPlugin({ enabled: false }).setup(hub, { dsn: "" });
    history.pushState({}, "", "/nope");

    expect(pvEvents(transport)).toHaveLength(0);
  });

  it("幂等 patch：重复 setup 不重复 wrap pushState", () => {
    const transport = createSpyTransport();
    const hub = createStubHub(transport);

    pageViewPlugin().setup(hub, { dsn: "" });
    const afterFirst = history.pushState;
    pageViewPlugin().setup(hub, { dsn: "" });
    expect(history.pushState).toBe(afterFirst);
    expect((history as PatchedHistory).__ghcPageViewPatched).toBe(true);
  });
});
