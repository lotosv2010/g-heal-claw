import { describe, it, expect, vi } from "vitest";
import { GatewayService } from "./gateway.service.js";
import type { ErrorsService } from "../errors/errors.service.js";
import type { PerformanceService } from "../performance/performance.service.js";
import type { IngestRequest } from "./ingest.dto.js";
import {
  buildCustomLogEvent,
  buildErrorEvent,
} from "../../test/fixtures.js";

function buildLogPayload(eventCount: number): IngestRequest {
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

function createService(): {
  svc: GatewayService;
  perfSave: ReturnType<typeof vi.fn>;
  errorsSave: ReturnType<typeof vi.fn>;
} {
  const perfSave = vi.fn(async () => 0);
  const errorsSave = vi.fn(async () => 0);
  const perf = { saveBatch: perfSave } as unknown as PerformanceService;
  const errors = { saveBatch: errorsSave } as unknown as ErrorsService;
  return { svc: new GatewayService(perf, errors), perfSave, errorsSave };
}

describe("GatewayService", () => {
  it("非性能/异常事件只走日志分支，不触发 saveBatch", async () => {
    const { svc, perfSave, errorsSave } = createService();
    await expect(svc.ingest(buildLogPayload(3))).resolves.toEqual({
      accepted: 3,
      persisted: 0,
    });
    expect(perfSave).not.toHaveBeenCalled();
    expect(errorsSave).not.toHaveBeenCalled();
  });

  it("error 事件分流到 ErrorsService 并累加 persisted 计数", async () => {
    const { svc, perfSave, errorsSave } = createService();
    errorsSave.mockResolvedValueOnce(2);
    const payload: IngestRequest = {
      dsn: "http://pk@localhost:3001/demo",
      sentAt: Date.now(),
      events: [
        buildErrorEvent({
          eventId: "11111111-2222-4333-8444-aaaaaaaaaaaa",
          message: "e1",
        }),
        buildErrorEvent({
          eventId: "11111111-2222-4333-8444-bbbbbbbbbbbb",
          message: "e2",
        }),
      ],
    };
    await expect(svc.ingest(payload)).resolves.toEqual({
      accepted: 2,
      persisted: 2,
    });
    expect(errorsSave).toHaveBeenCalledTimes(1);
    expect(errorsSave.mock.calls[0]?.[0]).toHaveLength(2);
    expect(perfSave).not.toHaveBeenCalled();
  });

  it("混合批次：perf + error + custom 同时分流，persisted 正确累加", async () => {
    const { svc, perfSave, errorsSave } = createService();
    perfSave.mockResolvedValueOnce(0);
    errorsSave.mockResolvedValueOnce(1);
    const payload: IngestRequest = {
      dsn: "http://pk@localhost:3001/demo",
      sentAt: Date.now(),
      events: [
        buildCustomLogEvent({
          eventId: "11111111-2222-4333-8444-111111111111",
        }),
        buildErrorEvent({
          eventId: "11111111-2222-4333-8444-222222222222",
        }),
      ],
    };
    await expect(svc.ingest(payload)).resolves.toEqual({
      accepted: 2,
      persisted: 1,
    });
    expect(errorsSave).toHaveBeenCalledTimes(1);
  });
});
