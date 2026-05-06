import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseUtmParams,
  detectSearchEngine,
  detectChannel,
  contextPlugin,
} from "../../src/plugins/context.js";
import type { Hub } from "../../src/hub.js";

describe("contextPlugin", () => {
  describe("parseUtmParams", () => {
    it("解析完整 UTM 参数", () => {
      const search =
        "?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=sdk&utm_content=banner";
      const result = parseUtmParams(search);
      expect(result).toEqual({
        source: "google",
        medium: "cpc",
        campaign: "spring",
        term: "sdk",
        content: "banner",
      });
    });

    it("部分 UTM 参数", () => {
      const result = parseUtmParams("?utm_source=twitter&utm_medium=social");
      expect(result).toEqual({ source: "twitter", medium: "social" });
    });

    it("无 UTM 参数返回 undefined", () => {
      expect(parseUtmParams("?page=1&sort=name")).toBeUndefined();
    });

    it("空字符串返回 undefined", () => {
      expect(parseUtmParams("")).toBeUndefined();
    });
  });

  describe("detectSearchEngine", () => {
    it("识别 Google", () => {
      expect(detectSearchEngine("https://www.google.com/search?q=test")).toBe("google");
    });

    it("识别百度", () => {
      expect(detectSearchEngine("https://www.baidu.com/s?wd=test")).toBe("baidu");
    });

    it("识别 Bing", () => {
      expect(detectSearchEngine("https://www.bing.com/search?q=test")).toBe("bing");
    });

    it("识别搜狗", () => {
      expect(detectSearchEngine("https://www.sogou.com/web?query=test")).toBe("sogou");
    });

    it("非搜索引擎返回 undefined", () => {
      expect(detectSearchEngine("https://example.com/page")).toBeUndefined();
    });

    it("空 referrer 返回 undefined", () => {
      expect(detectSearchEngine("")).toBeUndefined();
    });
  });

  describe("detectChannel", () => {
    it("UTM medium=cpc 归因为 paid_search", () => {
      expect(detectChannel("?utm_medium=cpc", "")).toBe("paid_search");
    });

    it("UTM medium=email 归因为 email", () => {
      expect(detectChannel("?utm_medium=email", "")).toBe("email");
    });

    it("UTM medium=social 归因为 social", () => {
      expect(detectChannel("?utm_medium=social", "")).toBe("social");
    });

    it("无 referrer + 无 UTM 归因为 direct", () => {
      expect(detectChannel("", "")).toBe("direct");
    });

    it("搜索引擎 referrer 归因为 organic_search", () => {
      expect(
        detectChannel("", "https://www.google.com/search?q=test"),
      ).toBe("organic_search");
    });

    it("社交平台 referrer 归因为 social", () => {
      expect(
        detectChannel("", "https://www.facebook.com/share"),
      ).toBe("social");
    });
  });

  describe("plugin setup", () => {
    let mockHub: Hub;
    let setContextCalls: Array<[string, Record<string, unknown>]>;

    beforeEach(() => {
      setContextCalls = [];
      mockHub = {
        dsn: { publicKey: "pk", projectId: "demo", host: "localhost", port: 3001, protocol: "http" },
        options: { dsn: "http://pk@localhost:3001/demo" },
        logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
        transport: { send: vi.fn(), flush: vi.fn() },
        scope: { tags: {}, context: {}, breadcrumbs: [] },
        sessionId: "sess-1",
        setUser: vi.fn(),
        setTag: vi.fn(),
        setContext: vi.fn((key: string, val: Record<string, unknown>) => {
          setContextCalls.push([key, val]);
        }),
        addBreadcrumb: vi.fn(),
        getScopeSnapshot: vi.fn(),
      } as unknown as Hub;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("非浏览器环境静默跳过", () => {
      const origWindow = globalThis.window;
      // @ts-expect-error -- simulate non-browser
      delete globalThis.window;
      const plugin = contextPlugin();
      plugin.setup(mockHub, { dsn: "" } as never);
      expect(setContextCalls).toHaveLength(0);
      globalThis.window = origWindow;
    });

    it("有 UTM 参数时写入 context", () => {
      Object.defineProperty(window, "location", {
        value: { search: "?utm_source=test&utm_medium=cpc", hostname: "localhost", href: "http://localhost/" },
        writable: true,
      });
      Object.defineProperty(document, "referrer", { value: "", configurable: true });

      const plugin = contextPlugin();
      plugin.setup(mockHub, { dsn: "" } as never);

      expect(setContextCalls.length).toBeGreaterThan(0);
      const [key, val] = setContextCalls[0]!;
      expect(key).toBe("page_extra");
      expect(val.utm).toEqual({ source: "test", medium: "cpc" });
      expect(val.channel).toBe("paid_search");
    });
  });
});
