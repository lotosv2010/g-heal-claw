import { describe, it, expect } from "vitest";
import { GatewayService } from "./gateway.service.js";
import type { IngestRequest } from "./ingest.dto.js";
import { buildCustomLogEvent } from "../../test/fixtures.js";

function buildPayload(eventCount: number): IngestRequest {
  return {
    dsn: "http://pk@localhost:3001/demo",
    sentAt: Date.now(),
    events: Array.from({ length: eventCount }, (_, i) =>
      buildCustomLogEvent({ eventId: `11111111-2222-3333-4444-${String(i).padStart(12, "0")}`, message: `m${i}` }),
    ),
  };
}

describe("GatewayService", () => {
  it("返回 accepted 计数等于 events 长度", () => {
    const svc = new GatewayService();
    expect(svc.ingest(buildPayload(3))).toEqual({ accepted: 3 });
    expect(svc.ingest(buildPayload(1))).toEqual({ accepted: 1 });
  });
});
