import { describe, it, expect } from "vitest";
import { createBaseEvent } from "./event.js";
import { createHub } from "./hub.js";
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

function buildHub() {
  return createHub({
    dsn,
    options: {
      dsn: "http://pk@localhost:3001/demo",
      environment: "test",
      release: "1.0.0",
      maxBreadcrumbs: 10,
      debug: false,
    },
    logger: createLogger(false),
    transport: noopTransport,
    sessionId: "sess-42",
  });
}

describe("createBaseEvent", () => {
  it("填充 BaseEvent 所有必填字段并快照 scope", () => {
    const hub = buildHub();
    hub.setUser({ id: "u1" });
    hub.setTag("page", "home");
    hub.setContext("flag", { beta: true });

    const ev = createBaseEvent(hub, "custom_log");

    expect(ev.eventId).toBeTypeOf("string");
    expect(ev.eventId.length).toBeGreaterThan(0);
    expect(ev.projectId).toBe("demo");
    expect(ev.publicKey).toBe("pk");
    expect(ev.type).toBe("custom_log");
    expect(ev.environment).toBe("test");
    expect(ev.release).toBe("1.0.0");
    expect(ev.sessionId).toBe("sess-42");
    expect(ev.user).toEqual({ id: "u1" });
    expect(ev.tags).toEqual({ page: "home" });
    expect(ev.context).toEqual({ flag: { beta: true } });
    expect(ev.device).toBeDefined();
    expect(ev.page).toBeDefined();
    expect(typeof ev.timestamp).toBe("number");
  });

  it("每次生成的 eventId 互不相同", () => {
    const hub = buildHub();
    const a = createBaseEvent(hub, "error");
    const b = createBaseEvent(hub, "error");
    expect(a.eventId).not.toBe(b.eventId);
  });
});
