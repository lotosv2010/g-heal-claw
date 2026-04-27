import { describe, it, expect, vi, afterEach } from "vitest";
import { createFetchTransport } from "./fetch.js";
import { createLogger } from "../logger.js";
import type { SdkEvent } from "@g-heal-claw/shared";

const logger = createLogger(false);

function makeEvent(): SdkEvent {
  return {
    eventId: "e1",
    projectId: "demo",
    publicKey: "pk",
    timestamp: 1,
    type: "custom_log",
    environment: "test",
    sessionId: "s1",
    tags: {},
    context: {},
    device: { ua: "jsdom" },
    page: { url: "http://localhost" },
    level: "info",
    message: "hi",
    breadcrumbs: [],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createFetchTransport", () => {
  it("send 以 {dsn, sentAt, events:[event]} 形式 POST，且 keepalive=true", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    const transport = createFetchTransport({
      endpoint: "http://localhost:3001/ingest/v1/events",
      dsn: "http://pk@localhost:3001/demo",
      logger,
    });
    const ok = await transport.send(makeEvent());

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://localhost:3001/ingest/v1/events");
    expect(init?.method).toBe("POST");
    expect(init?.keepalive).toBe(true);
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      dsn: "http://pk@localhost:3001/demo",
      events: [{ eventId: "e1", type: "custom_log" }],
    });
    expect(typeof body.sentAt).toBe("number");
  });

  it("fetch 抛错时不外泄异常且返回 false", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
    const transport = createFetchTransport({
      endpoint: "http://localhost:3001/ingest/v1/events",
      dsn: "http://pk@localhost:3001/demo",
      logger,
    });
    const ok = await transport.send(makeEvent());
    expect(ok).toBe(false);
  });

  it("flush 为幂等 true", async () => {
    const transport = createFetchTransport({
      endpoint: "http://localhost:3001/ingest/v1/events",
      dsn: "http://pk@localhost:3001/demo",
      logger,
    });
    await expect(transport.flush()).resolves.toBe(true);
  });
});
