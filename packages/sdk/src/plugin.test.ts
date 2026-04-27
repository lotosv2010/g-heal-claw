import { describe, it, expect, vi } from "vitest";
import { PluginRegistry, type Plugin } from "./plugin.js";
import { createLogger } from "./logger.js";
import type { Hub } from "./hub.js";
import type { GHealClawOptions } from "./options.js";

// 构造一个最小 Hub stub；测试只关心 logger 被调用次数与插件 setup 参数
function stubHub(): Hub {
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
      name: "noop",
      async send() {
        return true;
      },
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

const options: GHealClawOptions = {
  dsn: "http://pk@localhost:3001/demo",
};

describe("PluginRegistry", () => {
  it("register 重复名称打 warn 且后者覆盖", () => {
    const registry = new PluginRegistry();
    const logger = createLogger(true);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const first: Plugin = { name: "dup", setup: vi.fn() };
    const second: Plugin = { name: "dup", setup: vi.fn() };
    registry.register(first, logger);
    registry.register(second, logger);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]).toBe(second);
  });

  it("setupAll 对每个插件调用 setup 并传入 hub + options", () => {
    const registry = new PluginRegistry();
    const logger = createLogger(false);
    const hub = stubHub();
    const a: Plugin = { name: "a", setup: vi.fn() };
    const b: Plugin = { name: "b", setup: vi.fn() };
    registry.register(a, logger);
    registry.register(b, logger);
    registry.setupAll(hub, options);
    expect(a.setup).toHaveBeenCalledWith(hub, options);
    expect(b.setup).toHaveBeenCalledWith(hub, options);
  });

  it("setupAll 某插件抛错不影响其他插件执行", () => {
    const registry = new PluginRegistry();
    const logger = createLogger(false);
    const hub = stubHub();
    const errSpy = vi.spyOn(hub.logger, "error").mockImplementation(() => {});
    const boom: Plugin = {
      name: "boom",
      setup: () => {
        throw new Error("x");
      },
    };
    const ok: Plugin = { name: "ok", setup: vi.fn() };
    registry.register(boom, logger);
    registry.register(ok, logger);
    registry.setupAll(hub, options);
    expect(ok.setup).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledTimes(1);
  });
});
