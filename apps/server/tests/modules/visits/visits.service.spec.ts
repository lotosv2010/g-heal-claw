import { describe, it, expect, vi } from "vitest";
import type { PageViewEvent } from "@g-heal-claw/shared";
import { VisitsService } from "../../../src/modules/visits/visits.service.js";
import type { DatabaseService } from "../../../src/shared/database/database.service.js";
import type { GeoIpService } from "../../../src/shared/geoip.service.js";

const mockGeoip = { lookup: () => ({ country: null, region: null, city: null }) } as unknown as GeoIpService;

/**
 * VisitsService 单测（ADR-0020 Tier 2.A / TM.2.A.3）
 *
 * 定位：行 → DTO 转换逻辑单测，不验证 SQL 本身
 *  - stub `DatabaseService.db.execute()` 注入预制行
 *  - 覆盖：db=null 短路、saveBatch 空数组、aggregate 4 个方法 Number 强转 / 占比计算
 *  - SQL 正确性由 Dockerized PG 集成测试负责
 */

interface ExecuteStub {
  (sql: unknown): Promise<readonly Record<string, unknown>[]>;
}

function createStubDb(queue: readonly Record<string, unknown>[][]): {
  readonly service: DatabaseService;
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
  return { service };
}

const WINDOW = {
  projectId: "proj_test",
  sinceMs: 1_700_000_000_000,
  untilMs: 1_700_000_003_600_000,
};

describe("VisitsService / db=null 短路", () => {
  const nullDb = { db: null } as unknown as DatabaseService;

  it("saveBatch 空数组返回 0", async () => {
    const svc = new VisitsService(nullDb);
    expect(await svc.saveBatch([])).toBe(0);
  });

  it("saveBatch db=null 返回 0", async () => {
    const svc = new VisitsService(nullDb);
    expect(await svc.saveBatch([buildPageViewEvent()])).toBe(0);
  });

  it("countForProject db=null 返回 0", async () => {
    const svc = new VisitsService(nullDb);
    expect(await svc.countForProject("p")).toBe(0);
  });

  it("aggregateSummary db=null 返回零填充", async () => {
    const svc = new VisitsService(nullDb);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      pv: 0,
      uv: 0,
      spaNavCount: 0,
      reloadCount: 0,
    });
  });

  it("aggregateTrend / aggregateTopPages / aggregateTopReferrers db=null 返回空数组", async () => {
    const svc = new VisitsService(nullDb);
    expect(await svc.aggregateTrend(WINDOW)).toEqual([]);
    expect(await svc.aggregateTopPages(WINDOW, 10)).toEqual([]);
    expect(await svc.aggregateTopReferrers(WINDOW, 10)).toEqual([]);
  });
});

describe("VisitsService / aggregateSummary", () => {
  it("字符串数值强转 number", async () => {
    const { service } = createStubDb([
      [{ pv: "120", uv: "50", spa: "80", reload: "10" }],
    ]);
    const svc = new VisitsService(service);
    const out = await svc.aggregateSummary(WINDOW);
    expect(out).toEqual({
      pv: 120,
      uv: 50,
      spaNavCount: 80,
      reloadCount: 10,
    });
  });

  it("空结果集返回零填充", async () => {
    const { service } = createStubDb([[]]);
    const svc = new VisitsService(service);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      pv: 0,
      uv: 0,
      spaNavCount: 0,
      reloadCount: 0,
    });
  });
});

describe("VisitsService / aggregateTrend", () => {
  it("Date / ISO 字符串双路归一为 ISO", async () => {
    const { service } = createStubDb([
      [
        {
          hour: new Date("2026-04-29T10:00:00.000Z"),
          pv: "50",
          uv: "30",
        },
        {
          hour: "2026-04-29T11:00:00.000Z",
          pv: 0,
          uv: 0,
        },
      ],
    ]);
    const svc = new VisitsService(service);
    const out = await svc.aggregateTrend(WINDOW);
    expect(out).toEqual([
      { hour: "2026-04-29T10:00:00.000Z", pv: 50, uv: 30 },
      { hour: "2026-04-29T11:00:00.000Z", pv: 0, uv: 0 },
    ]);
  });
});

describe("VisitsService / aggregateTopPages", () => {
  it("计算 sharePercent：pv / total * 100", async () => {
    const { service } = createStubDb([
      [
        { path: "/", pv: "60", uv: "40", total: "100" },
        { path: "/settings", pv: "20", uv: "15", total: "100" },
        { path: "/api", pv: "20", uv: "10", total: "100" },
      ],
    ]);
    const svc = new VisitsService(service);
    const out = await svc.aggregateTopPages(WINDOW, 10);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ path: "/", pv: 60, uv: 40, sharePercent: 60 });
    expect(out[1]?.sharePercent).toBe(20);
  });

  it("total=0 时 sharePercent=0（防除零）", async () => {
    const { service } = createStubDb([
      [{ path: "/", pv: "0", uv: "0", total: "0" }],
    ]);
    const svc = new VisitsService(service);
    const out = await svc.aggregateTopPages(WINDOW, 10);
    expect(out[0]?.sharePercent).toBe(0);
  });
});

describe("VisitsService / aggregateTopReferrers", () => {
  it("referrer_host null → 'direct'", async () => {
    const { service } = createStubDb([
      [
        { referrer_host: "google.com", pv: "30", total: "100" },
        { referrer_host: null, pv: "70", total: "100" },
      ],
    ]);
    const svc = new VisitsService(service);
    const out = await svc.aggregateTopReferrers(WINDOW, 10);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      referrerHost: "google.com",
      pv: 30,
      sharePercent: 30,
    });
    expect(out[1]?.referrerHost).toBe("direct");
  });
});

function buildPageViewEvent(
  overrides: Partial<PageViewEvent> = {},
): PageViewEvent {
  return {
    type: "page_view",
    eventId: "11111111-2222-4333-8444-555555555555",
    projectId: "proj_test",
    publicKey: "pk_demo",
    sessionId: "sess_1",
    timestamp: 1_700_000_000_000,
    enterAt: 1_700_000_000_000,
    loadType: "navigate",
    isSpaNav: false,
    page: {
      url: "https://app.example.com/",
      path: "/",
      referrer: "https://google.com/search?q=app",
    },
    device: {
      ua: "test",
    },
    ...overrides,
  } as PageViewEvent;
}
