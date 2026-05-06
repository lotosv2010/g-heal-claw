import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { breadcrumbPlugin } from "../../src/plugins/breadcrumb.js";
import { createHub } from "../../src/hub.js";
import { resolveOptions } from "../../src/options.js";
import type { ParsedDsn } from "../../src/dsn.js";

function makeHub(maxBreadcrumbs = 100) {
  const dsn: ParsedDsn = {
    protocol: "https",
    host: "example.com",
    publicKey: "pk_test",
    projectId: "proj_1",
    ingestUrl: "https://example.com/ingest/v1/events",
  };
  const options = resolveOptions({ dsn: "https://pk_test@example.com/proj_1", maxBreadcrumbs });
  const transport = { send: vi.fn().mockResolvedValue(undefined), flush: vi.fn().mockResolvedValue(undefined) };
  const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return createHub({ dsn, options, logger, transport, sessionId: "sess_1" });
}

describe("breadcrumbPlugin", () => {
  let origPushState: typeof history.pushState;
  let origReplaceState: typeof history.replaceState;

  beforeEach(() => {
    origPushState = history.pushState;
    origReplaceState = history.replaceState;
  });

  afterEach(() => {
    history.pushState = origPushState;
    history.replaceState = origReplaceState;
    vi.restoreAllMocks();
  });

  describe("navigation", () => {
    it("history.pushState 记录 navigation breadcrumb", () => {
      const hub = makeHub();
      const plugin = breadcrumbPlugin();
      plugin.setup(hub);

      history.pushState(null, "", "/new-page");

      const bcs = hub.scope.breadcrumbs;
      expect(bcs.length).toBeGreaterThanOrEqual(1);
      const nav = bcs.find((b) => b.category === "navigation");
      expect(nav).toBeDefined();
      expect(nav!.message).toContain("/new-page");
      expect(nav!.data).toHaveProperty("to");
    });

    it("history.replaceState 记录 navigation breadcrumb", () => {
      const hub = makeHub();
      const plugin = breadcrumbPlugin();
      plugin.setup(hub);

      history.replaceState(null, "", "/replaced");

      const nav = hub.scope.breadcrumbs.find((b) => b.category === "navigation");
      expect(nav).toBeDefined();
      expect(nav!.message).toContain("/replaced");
    });

    it("相同 URL 不重复记录", () => {
      const hub = makeHub();
      const plugin = breadcrumbPlugin();
      plugin.setup(hub);

      const currentPath = location.pathname;
      history.pushState(null, "", currentPath);

      const navs = hub.scope.breadcrumbs.filter((b) => b.category === "navigation");
      expect(navs.length).toBe(0);
    });
  });

  describe("click", () => {
    it("点击记录 click breadcrumb", () => {
      const hub = makeHub();
      const plugin = breadcrumbPlugin();
      plugin.setup(hub);

      const btn = document.createElement("button");
      btn.id = "test-btn";
      btn.textContent = "Click me";
      document.body.appendChild(btn);
      btn.click();
      document.body.removeChild(btn);

      const click = hub.scope.breadcrumbs.find((b) => b.category === "click");
      expect(click).toBeDefined();
      expect(click!.message).toContain("button#test-btn");
      expect(click!.data).toHaveProperty("text", "Click me");
    });

    it("text 截断到 maxClickTextLength", () => {
      const hub = makeHub();
      const plugin = breadcrumbPlugin({ maxClickTextLength: 5 });
      plugin.setup(hub);

      const span = document.createElement("span");
      span.textContent = "Hello World Long Text";
      document.body.appendChild(span);
      span.click();
      document.body.removeChild(span);

      const click = hub.scope.breadcrumbs.find((b) => b.category === "click");
      expect(click).toBeDefined();
      expect((click!.data as { text: string }).text.length).toBeLessThanOrEqual(5);
    });
  });

  describe("console", () => {
    it("console.log 记录 breadcrumb", () => {
      const hub = makeHub();
      const plugin = breadcrumbPlugin();
      plugin.setup(hub);

      console.log("test message");

      const bc = hub.scope.breadcrumbs.find(
        (b) => b.category === "console" && b.message?.includes("test message"),
      );
      expect(bc).toBeDefined();
      expect(bc!.level).toBe("info");
    });

    it("console.error 标记为 error level", () => {
      const hub = makeHub();
      const plugin = breadcrumbPlugin();
      plugin.setup(hub);

      console.error("oops");

      const bc = hub.scope.breadcrumbs.find(
        (b) => b.category === "console" && b.message?.includes("oops"),
      );
      expect(bc).toBeDefined();
      expect(bc!.level).toBe("error");
    });

    it("console args 截断到 maxConsoleArgLength", () => {
      const hub = makeHub();
      const plugin = breadcrumbPlugin({ maxConsoleArgLength: 10 });
      plugin.setup(hub);

      console.log("a".repeat(100));

      const bc = hub.scope.breadcrumbs.find((b) => b.category === "console");
      expect(bc).toBeDefined();
      expect(bc!.message!.length).toBeLessThanOrEqual(11); // 10 + "…"
    });
  });

  describe("fetch", () => {
    it("fetch 请求记录 breadcrumb", async () => {
      const hub = makeHub();
      const mockResponse = new Response("ok", { status: 200 });
      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse) as typeof fetch;

      const plugin = breadcrumbPlugin();
      plugin.setup(hub);

      await fetch("https://api.example.com/data");

      const bc = hub.scope.breadcrumbs.find((b) => b.category === "fetch");
      expect(bc).toBeDefined();
      expect(bc!.message).toContain("GET");
      expect(bc!.message).toContain("https://api.example.com/data");

      globalThis.fetch = origFetch;
    });
  });

  describe("SSR 降级", () => {
    it("typeof window === undefined 时不抛错", () => {
      const origWindow = globalThis.window;
      // @ts-expect-error SSR 模拟
      delete globalThis.window;

      const hub = makeHub();
      const plugin = breadcrumbPlugin();
      expect(() => plugin.setup(hub)).not.toThrow();

      globalThis.window = origWindow;
    });
  });

  describe("环形缓冲溢出", () => {
    it("超过 maxBreadcrumbs 丢弃最旧", () => {
      const hub = makeHub(3);
      const plugin = breadcrumbPlugin({ navigation: false, click: false, console: false, fetch: false });
      plugin.setup(hub);

      hub.addBreadcrumb({ timestamp: 1, category: "test", level: "info", message: "a" });
      hub.addBreadcrumb({ timestamp: 2, category: "test", level: "info", message: "b" });
      hub.addBreadcrumb({ timestamp: 3, category: "test", level: "info", message: "c" });
      hub.addBreadcrumb({ timestamp: 4, category: "test", level: "info", message: "d" });

      expect(hub.scope.breadcrumbs.length).toBe(3);
      expect(hub.scope.breadcrumbs[0].message).toBe("b");
      expect(hub.scope.breadcrumbs[2].message).toBe("d");
    });
  });

  describe("option toggles", () => {
    it("navigation=false 不采集路由", () => {
      const hub = makeHub();
      const plugin = breadcrumbPlugin({ navigation: false });
      plugin.setup(hub);

      history.pushState(null, "", "/disabled-nav");

      const nav = hub.scope.breadcrumbs.find((b) => b.category === "navigation");
      expect(nav).toBeUndefined();
    });

    it("click=false 不采集点击", () => {
      const hub = makeHub();
      const plugin = breadcrumbPlugin({ click: false });
      plugin.setup(hub);

      const btn = document.createElement("button");
      document.body.appendChild(btn);
      btn.click();
      document.body.removeChild(btn);

      const click = hub.scope.breadcrumbs.find((b) => b.category === "click");
      expect(click).toBeUndefined();
    });
  });
});
