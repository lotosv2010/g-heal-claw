import { describe, it, expect, vi } from "vitest";
import type { CustomEvent } from "@g-heal-claw/shared";
import { CustomEventsService } from "../../../src/modules/custom/custom-events.service.js";
import type { DatabaseService } from "../../../src/shared/database/database.service.js";

/**
 * CustomEventsService 单测（ADR-0023 §4 / TM.1.C.3）
 *
 * 定位：行 → DTO 转换单测（不验证 SQL 语义）
 *  - stub `DatabaseService.db.execute()` / `.insert()` 注入预制行
 *  - 覆盖：db=null 短路、saveBatch 空数组、aggregate 的 Number 强转 / 空结果归零
 *  - SQL 正确性由 Dockerized PG 集成测试负责
 */

interface ExecuteStub {
  (sql: unknown): Promise<readonly Record<string, unknown>[]>;
}

function createStubDb(queue: readonly Record<string, unknown>[][]): {
  readonly service: DatabaseService;
  readonly executeSpy: ReturnType<typeof vi.fn>;
} {
  let idx = 0;
  const executeSpy = vi.fn<ExecuteStub>(async () => {
    const rows = queue[idx] ?? [];
    idx += 1;
    return rows;
  });
  const db = { execute: executeSpy } as unknown as NonNullable<
    DatabaseService["db"]
  >;
  const service = { db } as unknown as DatabaseService;
  return { service, executeSpy };
}

const WINDOW = {
  projectId: "proj_test",
  sinceMs: 1_700_000_000_000,
  untilMs: 1_700_000_003_600_000,
};

describe("CustomEventsService / db=null 短路", () => {
  const nullDb = { db: null } as unknown as DatabaseService;

  it("saveBatch 空数组返回 0", async () => {
    const svc = new CustomEventsService(nullDb);
    expect(await svc.saveBatch([])).toBe(0);
  });

  it("saveBatch db=null 返回 0", async () => {
    const svc = new CustomEventsService(nullDb);
    expect(await svc.saveBatch([buildCustomEvent()])).toBe(0);
  });

  it("countForProject db=null 返回 0", async () => {
    const svc = new CustomEventsService(nullDb);
    expect(await svc.countForProject("p")).toBe(0);
  });

  it("aggregateSummary db=null 返回零填充", async () => {
    const svc = new CustomEventsService(nullDb);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalEvents: 0,
      distinctNames: 0,
      topEventName: null,
      avgPerSession: 0,
    });
  });

  it("aggregateTopEvents / aggregateTrend / aggregateTopPages db=null 返回空数组", async () => {
    const svc = new CustomEventsService(nullDb);
    expect(await svc.aggregateTopEvents(WINDOW, 10)).toEqual([]);
    expect(await svc.aggregateTrend(WINDOW)).toEqual([]);
    expect(await svc.aggregateTopPages(WINDOW, 10)).toEqual([]);
  });
});

describe("CustomEventsService / aggregateSummary", () => {
  it("字符串数值强转 + avgPerSession 计算", async () => {
    const { service } = createStubDb([
      [{ total: "500", names: "20", sessions: "50", top: "checkout" }],
    ]);
    const svc = new CustomEventsService(service);
    const out = await svc.aggregateSummary(WINDOW);
    expect(out).toEqual({
      totalEvents: 500,
      distinctNames: 20,
      topEventName: "checkout",
      avgPerSession: 10,
    });
  });

  it("top=null → topEventName null；sessions=0 → avgPerSession=0", async () => {
    const { service } = createStubDb([
      [{ total: "0", names: "0", sessions: "0", top: null }],
    ]);
    const svc = new CustomEventsService(service);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalEvents: 0,
      distinctNames: 0,
      topEventName: null,
      avgPerSession: 0,
    });
  });

  it("空结果集 → 零填充", async () => {
    const { service } = createStubDb([[]]);
    const svc = new CustomEventsService(service);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalEvents: 0,
      distinctNames: 0,
      topEventName: null,
      avgPerSession: 0,
    });
  });
});

describe("CustomEventsService / aggregateTopEvents", () => {
  it("字符串 count/last 强转 + 保持顺序", async () => {
    const { service, executeSpy } = createStubDb([
      [
        { name: "checkout", n: "120", last: "1700000003000000" },
        { name: "view", n: "80", last: 1_700_000_002_000_000 },
      ],
    ]);
    const svc = new CustomEventsService(service);
    const out = await svc.aggregateTopEvents(WINDOW, 999);
    expect(executeSpy).toHaveBeenCalledOnce();
    expect(out).toEqual([
      { name: "checkout", count: 120, lastSeenMs: 1_700_000_003_000_000 },
      { name: "view", count: 80, lastSeenMs: 1_700_000_002_000_000 },
    ]);
  });
});

describe("CustomEventsService / aggregateTrend", () => {
  it("Date / ISO 字符串双路归一", async () => {
    const { service } = createStubDb([
      [
        { hour: new Date("2026-04-29T10:00:00.000Z"), n: "30" },
        { hour: "2026-04-29T11:00:00.000Z", n: 0 },
      ],
    ]);
    const svc = new CustomEventsService(service);
    expect(await svc.aggregateTrend(WINDOW)).toEqual([
      { hour: "2026-04-29T10:00:00.000Z", count: 30 },
      { hour: "2026-04-29T11:00:00.000Z", count: 0 },
    ]);
  });
});

describe("CustomEventsService / aggregateTopPages", () => {
  it("字符串 count 强转 + 保留顺序", async () => {
    const { service } = createStubDb([
      [
        { path: "/checkout", n: "60" },
        { path: "/product", n: "40" },
      ],
    ]);
    const svc = new CustomEventsService(service);
    expect(await svc.aggregateTopPages(WINDOW, 10)).toEqual([
      { pagePath: "/checkout", count: 60 },
      { pagePath: "/product", count: 40 },
    ]);
  });
});

/** CustomEvent fixture（最小合法字段） */
function buildCustomEvent(
  overrides: Partial<CustomEvent> = {},
): CustomEvent {
  return {
    type: "custom_event",
    eventId: "11111111-2222-4333-8444-555555555555",
    projectId: "proj_test",
    publicKey: "pk_demo",
    sessionId: "sess_1",
    timestamp: 1_700_000_000_000,
    name: "checkout",
    properties: { amount: 99 },
    page: {
      url: "https://app.example.com/",
      path: "/",
    },
    device: {
      ua: "test",
      os: "macOS",
      browser: "Chrome",
      deviceType: "desktop",
      screen: { width: 1920, height: 1080, dpr: 2 },
      language: "en-US",
      timezone: "UTC",
    },
    environment: "test",
    ...overrides,
  };
}
