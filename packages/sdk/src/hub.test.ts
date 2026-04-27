import { describe, it, expect, beforeEach } from "vitest";
import { createHub, getCurrentHub, resetHub, setCurrentHub } from "./hub.js";
import { createLogger } from "./logger.js";
import type { Transport } from "./transport/types.js";
import type { ParsedDsn } from "./dsn.js";

const dsn: ParsedDsn = {
  protocol: "http",
  publicKey: "pk",
  host: "localhost",
  port: "3001",
  projectId: "demo",
  ingestUrl: "http://localhost:3001/ingest/v1/events",
};

const noopTransport: Transport = {
  name: "noop",
  async send() {
    return true;
  },
  async flush() {
    return true;
  },
};

function build(maxBreadcrumbs = 3) {
  return createHub({
    dsn,
    options: {
      dsn: "http://pk@localhost:3001/demo",
      environment: "test",
      maxBreadcrumbs,
      debug: false,
    },
    logger: createLogger(false),
    transport: noopTransport,
    sessionId: "sess-1",
  });
}

describe("Hub", () => {
  beforeEach(() => resetHub());

  it("setUser / setTag / setContext 写入 scope", () => {
    const hub = build();
    hub.setUser({ id: "u1", email: "a@b.com" });
    hub.setTag("k", "v");
    hub.setContext("page", { id: 1 });
    expect(hub.scope.user?.id).toBe("u1");
    expect(hub.scope.tags.k).toBe("v");
    expect(hub.scope.context.page).toEqual({ id: 1 });
  });

  it("addBreadcrumb 超过 maxBreadcrumbs 触发 FIFO 淘汰", () => {
    const hub = build(3);
    for (let i = 0; i < 5; i++) {
      hub.addBreadcrumb({
        timestamp: i,
        category: "custom",
        level: "info",
        message: `m${i}`,
      });
    }
    expect(hub.scope.breadcrumbs).toHaveLength(3);
    expect(hub.scope.breadcrumbs[0].message).toBe("m2");
    expect(hub.scope.breadcrumbs[2].message).toBe("m4");
  });

  it("setCurrentHub / getCurrentHub / resetHub 工作正常", () => {
    expect(getCurrentHub()).toBeNull();
    const hub = build();
    setCurrentHub(hub);
    expect(getCurrentHub()).toBe(hub);
    resetHub();
    expect(getCurrentHub()).toBeNull();
  });
});
