import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import { GatewayService } from "../../src/gateway/gateway.service.js";
import type { ServerEnv } from "../../src/config/env.js";
import type { ApiService } from "../../src/modules/api/api.service.js";
import type { CustomEventsService } from "../../src/modules/custom/custom-events.service.js";
import type { CustomMetricsService } from "../../src/modules/custom/custom-metrics.service.js";
import type { ErrorsService } from "../../src/modules/errors/errors.service.js";
import type { LogsService } from "../../src/modules/logs/logs.service.js";
import type { PerformanceService } from "../../src/modules/performance/performance.service.js";
import type { ResourcesService } from "../../src/modules/resources/resources.service.js";
import type { TrackingService } from "../../src/modules/tracking/tracking.service.js";
import type { VisitsService } from "../../src/modules/visits/visits.service.js";
import type { RealtimeService } from "../../src/modules/realtime/realtime.service.js";
import type { IdempotencyService } from "../../src/gateway/idempotency.service.js";
import type { ErrorJobPayload } from "../../src/modules/errors/error.processor.js";
import { buildErrorEvent } from "../fixtures.js";

/**
 * GatewayService ERROR_PROCESSOR_MODE 分流单测（TM.E.2 / ADR-0026）
 *
 * 验证：
 *  - queue  : 仅 enqueue，errors.saveBatch 不被调用；persisted=0, enqueued=N
 *  - sync   : 仅 saveBatch；enqueued=0
 *  - dual   : 两者都被调用；persisted 含 error 份, enqueued=N
 *  - queue + enqueue 抛错 : 本进程降级 sync（下一次调用生效），当前调用补偿同步落库
 */

interface Stubs {
  perf: PerformanceService;
  errors: ErrorsService;
  api: ApiService;
  tracking: TrackingService;
  resources: ResourcesService;
  customEvents: CustomEventsService;
  customMetrics: CustomMetricsService;
  logs: LogsService;
  visits: VisitsService;
  realtime: RealtimeService;
  idempotency: IdempotencyService;
  queue: Queue<ErrorJobPayload>;
  errorsSaveBatch: ReturnType<typeof vi.fn>;
  queueAdd: ReturnType<typeof vi.fn>;
}

function buildStubs(opts: { queueThrows?: boolean } = {}): Stubs {
  const errorsSaveBatch = vi.fn(async () => 2);
  const queueAdd = vi.fn(async () => {
    if (opts.queueThrows) throw new Error("Redis down");
    return { id: "j1" };
  });
  return {
    perf: { saveBatch: vi.fn(async () => 0) } as unknown as PerformanceService,
    errors: { saveBatch: errorsSaveBatch } as unknown as ErrorsService,
    api: { saveBatch: vi.fn(async () => 0) } as unknown as ApiService,
    tracking: { saveBatch: vi.fn(async () => 0) } as unknown as TrackingService,
    resources: {
      saveBatch: vi.fn(async () => 0),
    } as unknown as ResourcesService,
    customEvents: {
      saveBatch: vi.fn(async () => 0),
    } as unknown as CustomEventsService,
    customMetrics: {
      saveBatch: vi.fn(async () => 0),
    } as unknown as CustomMetricsService,
    logs: { saveBatch: vi.fn(async () => 0) } as unknown as LogsService,
    visits: { saveBatch: vi.fn(async () => 0) } as unknown as VisitsService,
    realtime: {
      publish: vi.fn(async () => undefined),
    } as unknown as RealtimeService,
    idempotency: {
      dedup: vi.fn(async (events: readonly unknown[]) => ({
        first: events,
        duplicates: [],
      })),
    } as unknown as IdempotencyService,
    queue: { add: queueAdd } as unknown as Queue<ErrorJobPayload>,
    errorsSaveBatch,
    queueAdd,
  };
}

function buildEnv(mode: "sync" | "queue" | "dual"): ServerEnv {
  return {
    ERROR_PROCESSOR_MODE: mode,
    ERROR_PROCESSOR_ATTEMPTS: 3,
    ERROR_PROCESSOR_BACKOFF_MS: 2000,
  } as unknown as ServerEnv;
}

function buildGateway(
  s: Stubs,
  mode: "sync" | "queue" | "dual",
): GatewayService {
  return new GatewayService(
    s.perf,
    s.errors,
    s.api,
    s.tracking,
    s.resources,
    s.customEvents,
    s.customMetrics,
    s.logs,
    s.visits,
    s.realtime,
    s.idempotency,
    buildEnv(mode),
    s.queue,
  );
}

describe("GatewayService · ERROR_PROCESSOR_MODE", () => {
  const makePayload = () => ({
    sentAt: Date.now(),
    events: [buildErrorEvent(), buildErrorEvent({ eventId: "11111111-2222-4333-8444-000000000009" })],
  });

  it("queue：仅入队，persisted=0, enqueued=2", async () => {
    const stubs = buildStubs();
    const gw = buildGateway(stubs, "queue");
    const res = await gw.ingest(makePayload() as any);
    expect(stubs.errorsSaveBatch).not.toHaveBeenCalled();
    expect(stubs.queueAdd).toHaveBeenCalledTimes(1);
    expect(res.enqueued).toBe(2);
    expect(res.persisted).toBe(0);
  });

  it("sync：仅 saveBatch，enqueued=0", async () => {
    const stubs = buildStubs();
    const gw = buildGateway(stubs, "sync");
    const res = await gw.ingest(makePayload() as any);
    expect(stubs.errorsSaveBatch).toHaveBeenCalledTimes(1);
    expect(stubs.queueAdd).not.toHaveBeenCalled();
    expect(res.enqueued).toBe(0);
    expect(res.persisted).toBe(2);
  });

  it("dual：两路同时触发", async () => {
    const stubs = buildStubs();
    const gw = buildGateway(stubs, "dual");
    const res = await gw.ingest(makePayload() as any);
    expect(stubs.errorsSaveBatch).toHaveBeenCalledTimes(1);
    expect(stubs.queueAdd).toHaveBeenCalledTimes(1);
    expect(res.enqueued).toBe(2);
    expect(res.persisted).toBe(2);
  });

  it("queue + enqueue 失败 → 当前调用补偿 saveBatch，enqueued=0", async () => {
    const stubs = buildStubs({ queueThrows: true });
    const gw = buildGateway(stubs, "queue");
    const res = await gw.ingest(makePayload() as any);
    // 当前调用：enqueue 抛错后内部补偿 saveBatch
    expect(stubs.errorsSaveBatch).toHaveBeenCalledTimes(1);
    expect(res.enqueued).toBe(0);
    // persisted 来自补偿路径（错误事件的 saveBatch 在降级补偿里，不进外层 errorSync 计数）
    expect(res.persisted).toBe(0);
  });
});
