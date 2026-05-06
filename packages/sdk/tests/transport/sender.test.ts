import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSender } from "../../src/transport/sender.js";
import type { SdkEvent } from "@g-heal-claw/shared";

function makeEvent(id = "1"): SdkEvent {
  return {
    type: "custom_event",
    eventId: id,
    timestamp: Date.now(),
    sessionId: "sess",
    projectId: "proj",
    device: { screenWidth: 1920, screenHeight: 1080, pixelRatio: 1, language: "zh" },
    page: { url: "http://localhost", path: "/", title: "Test" },
  } as unknown as SdkEvent;
}

const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("Sender", () => {
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it("fetch channel 正常发送", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;

    const sender = createSender({
      endpoint: "https://api.example.com/ingest",
      beaconEndpoint: "https://api.example.com/beacon",
      dsn: "test-dsn",
      logger,
      preferredChannel: "fetch",
    });

    const ok = await sender.sendBatch([makeEvent()]);
    expect(ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("fetch 失败降级到 beacon", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    const mockBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis, "navigator", {
      value: { sendBeacon: mockBeacon },
      writable: true,
      configurable: true,
    });

    const sender = createSender({
      endpoint: "https://api.example.com/ingest",
      beaconEndpoint: "https://api.example.com/beacon",
      dsn: "test-dsn",
      logger,
      preferredChannel: "fetch",
    });

    const ok = await sender.sendBatch([makeEvent()]);
    expect(ok).toBe(true);
    expect(mockBeacon).toHaveBeenCalled();
  });

  it("beacon channel 正常发送", async () => {
    const mockBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis, "navigator", {
      value: { sendBeacon: mockBeacon },
      writable: true,
      configurable: true,
    });

    const sender = createSender({
      endpoint: "https://api.example.com/ingest",
      beaconEndpoint: "https://api.example.com/beacon",
      dsn: "test-dsn",
      logger,
      preferredChannel: "beacon",
    });

    const ok = await sender.sendBatch([makeEvent()]);
    expect(ok).toBe(true);
    expect(mockBeacon).toHaveBeenCalledWith("https://api.example.com/beacon", expect.any(String));
  });

  it("空 batch 直接返回 true", async () => {
    const sender = createSender({
      endpoint: "https://api.example.com/ingest",
      beaconEndpoint: "https://api.example.com/beacon",
      dsn: "test-dsn",
      logger,
      preferredChannel: "fetch",
    });

    const ok = await sender.sendBatch([]);
    expect(ok).toBe(true);
  });

  it("超大 payload 拆批发送（beacon）", async () => {
    const mockBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis, "navigator", {
      value: { sendBeacon: mockBeacon },
      writable: true,
      configurable: true,
    });

    // 构造超过 64KB 的事件
    const bigEvents: SdkEvent[] = [];
    for (let i = 0; i < 200; i++) {
      const event = makeEvent(String(i));
      (event as Record<string, unknown>).largePayload = "x".repeat(500);
      bigEvents.push(event);
    }

    const sender = createSender({
      endpoint: "https://api.example.com/ingest",
      beaconEndpoint: "https://api.example.com/beacon",
      dsn: "test-dsn",
      logger,
      preferredChannel: "beacon",
    });

    const ok = await sender.sendBatch(bigEvents);
    expect(ok).toBe(true);
    // 应该拆成多次 beacon 调用
    expect(mockBeacon.mock.calls.length).toBeGreaterThan(1);
  });
});
