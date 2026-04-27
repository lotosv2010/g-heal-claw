import { describe, it, expect, vi } from "vitest";
import { GatewayService } from "./gateway.service.js";
import type { PerformanceService } from "../performance/performance.service.js";
import type { IngestRequest } from "./ingest.dto.js";
import { buildCustomLogEvent } from "../../test/fixtures.js";

function buildPayload(eventCount: number): IngestRequest {
  return {
    dsn: "http://pk@localhost:3001/demo",
    sentAt: Date.now(),
    // 合法 UUIDv4：version 位必须为 4，variant 位必须为 8/9/a/b
    events: Array.from({ length: eventCount }, (_, i) =>
      buildCustomLogEvent({
        eventId: `11111111-2222-4333-8444-${String(i).padStart(12, "0")}`,
        message: `m${i}`,
      }),
    ),
  };
}

function createService(): { svc: GatewayService; saveBatch: ReturnType<typeof vi.fn> } {
  const saveBatch = vi.fn(async () => 0);
  const perf = { saveBatch } as unknown as PerformanceService;
  return { svc: new GatewayService(perf), saveBatch };
}

describe("GatewayService", () => {
  it("返回 accepted 计数等于 events 长度（非性能事件走日志分支）", async () => {
    const { svc, saveBatch } = createService();
    await expect(svc.ingest(buildPayload(3))).resolves.toEqual({
      accepted: 3,
      persisted: 0,
    });
    await expect(svc.ingest(buildPayload(1))).resolves.toEqual({
      accepted: 1,
      persisted: 0,
    });
    expect(saveBatch).not.toHaveBeenCalled();
  });
});
