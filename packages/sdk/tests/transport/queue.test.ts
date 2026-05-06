import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEventQueue } from "../../src/transport/queue.js";
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

describe("EventQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueue 不立即 flush", () => {
    const onFlush = vi.fn();
    const q = createEventQueue({ maxBatchSize: 5, flushIntervalMs: 1000, onFlush });
    q.enqueue(makeEvent());
    expect(onFlush).not.toHaveBeenCalled();
    q.destroy();
  });

  it("buffer 达到 maxBatchSize 触发 flush", () => {
    const onFlush = vi.fn();
    const q = createEventQueue({ maxBatchSize: 3, flushIntervalMs: 0, onFlush });
    q.enqueue(makeEvent("1"));
    q.enqueue(makeEvent("2"));
    expect(onFlush).not.toHaveBeenCalled();
    q.enqueue(makeEvent("3"));
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ eventId: "1" })]));
    expect(onFlush.mock.calls[0][0].length).toBe(3);
    q.destroy();
  });

  it("flushInterval 到期触发 flush", () => {
    const onFlush = vi.fn();
    const q = createEventQueue({ maxBatchSize: 100, flushIntervalMs: 500, onFlush });
    q.enqueue(makeEvent());
    expect(onFlush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(onFlush).toHaveBeenCalledTimes(1);
    q.destroy();
  });

  it("手动 flush 触发", () => {
    const onFlush = vi.fn();
    const q = createEventQueue({ maxBatchSize: 100, flushIntervalMs: 0, onFlush });
    q.enqueue(makeEvent());
    q.flush();
    expect(onFlush).toHaveBeenCalledTimes(1);
    q.destroy();
  });

  it("空 buffer flush 不触发回调", () => {
    const onFlush = vi.fn();
    const q = createEventQueue({ maxBatchSize: 100, flushIntervalMs: 0, onFlush });
    q.flush();
    expect(onFlush).not.toHaveBeenCalled();
    q.destroy();
  });

  it("size 返回当前缓冲区长度", () => {
    const onFlush = vi.fn();
    const q = createEventQueue({ maxBatchSize: 100, flushIntervalMs: 0, onFlush });
    expect(q.size()).toBe(0);
    q.enqueue(makeEvent());
    q.enqueue(makeEvent());
    expect(q.size()).toBe(2);
    q.flush();
    expect(q.size()).toBe(0);
    q.destroy();
  });

  it("destroy 清空计时器并 flush 剩余", () => {
    const onFlush = vi.fn();
    const q = createEventQueue({ maxBatchSize: 100, flushIntervalMs: 1000, onFlush });
    q.enqueue(makeEvent());
    q.destroy();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});
