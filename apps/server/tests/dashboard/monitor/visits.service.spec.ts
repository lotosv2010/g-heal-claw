import { describe, it, expect } from "vitest";
import { DashboardVisitsService } from "../../../src/dashboard/monitor/visits.service.js";
import type {
  VisitsService,
  VisitsSummaryRow,
  VisitsTrendRow,
  TopPageRow,
  TopReferrerRow,
  VisitsWindowParams,
} from "../../../src/modules/visits/visits.service.js";
import type { VisitsOverviewQuery } from "../../../src/dashboard/dto/visits-overview.dto.js";

/**
 * DashboardVisitsService 装配层单测（ADR-0020 Tier 2.A / TM.2.A.5）
 *
 * 覆盖：
 *  - summary 环比三方向（up / down / flat）
 *  - spaNavRatio / reloadRatio 除零保护 + round4
 *  - trend / topPages / topReferrers 透传 + round2 收口
 *  - 空窗口全零 + 空数组
 */

interface Stub {
  summaryCurrent: VisitsSummaryRow;
  summaryPrevious: VisitsSummaryRow;
  trend: VisitsTrendRow[];
  topPages: TopPageRow[];
  topReferrers: TopReferrerRow[];
}

function createStubVisits(stub: Stub): VisitsService {
  let summaryCallCount = 0;
  return {
    saveBatch: async () => 0,
    countForProject: async () => 0,
    aggregateSummary: async (_: VisitsWindowParams) => {
      summaryCallCount += 1;
      return summaryCallCount === 1 ? stub.summaryCurrent : stub.summaryPrevious;
    },
    aggregateTrend: async () => stub.trend,
    aggregateTopPages: async () => stub.topPages,
    aggregateTopReferrers: async () => stub.topReferrers,
    aggregateDimension: async () => [],
  } as unknown as VisitsService;
}

const QUERY: VisitsOverviewQuery = {
  projectId: "proj_test",
  windowHours: 24,
  limitPages: 10,
  limitReferrers: 10,
};

const EMPTY_SUMMARY: VisitsSummaryRow = {
  pv: 0,
  uv: 0,
  spaNavCount: 0,
  reloadCount: 0,
};

describe("DashboardVisitsService / summary + delta", () => {
  it("正向环比：pv +50%", async () => {
    const visits = createStubVisits({
      summaryCurrent: { pv: 150, uv: 60, spaNavCount: 90, reloadCount: 15 },
      summaryPrevious: { pv: 100, uv: 40, spaNavCount: 60, reloadCount: 10 },
      trend: [],
      topPages: [],
      topReferrers: [],
    });
    const svc = new DashboardVisitsService(visits);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.pv).toBe(150);
    expect(out.summary.uv).toBe(60);
    expect(out.summary.spaNavCount).toBe(90);
    expect(out.summary.reloadCount).toBe(15);
    // spaNavRatio = 90/150 = 0.6
    expect(out.summary.spaNavRatio).toBe(0.6);
    // reloadRatio = 15/150 = 0.1
    expect(out.summary.reloadRatio).toBe(0.1);
    expect(out.summary.deltaDirection).toBe("up");
    expect(out.summary.deltaPercent).toBe(50);
  });

  it("反向环比：pv -40%", async () => {
    const visits = createStubVisits({
      summaryCurrent: { pv: 60, uv: 30, spaNavCount: 20, reloadCount: 5 },
      summaryPrevious: { pv: 100, uv: 50, spaNavCount: 40, reloadCount: 10 },
      trend: [],
      topPages: [],
      topReferrers: [],
    });
    const svc = new DashboardVisitsService(visits);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.deltaDirection).toBe("down");
    expect(out.summary.deltaPercent).toBe(40);
  });

  it("previous=0 / current=0 → flat + 0%", async () => {
    const visits = createStubVisits({
      summaryCurrent: EMPTY_SUMMARY,
      summaryPrevious: EMPTY_SUMMARY,
      trend: [],
      topPages: [],
      topReferrers: [],
    });
    const svc = new DashboardVisitsService(visits);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.pv).toBe(0);
    expect(out.summary.spaNavRatio).toBe(0);
    expect(out.summary.reloadRatio).toBe(0);
    expect(out.summary.deltaDirection).toBe("flat");
    expect(out.summary.deltaPercent).toBe(0);
  });

  it("round4：spaNavRatio = 1/3 → 0.3333", async () => {
    const visits = createStubVisits({
      summaryCurrent: { pv: 3, uv: 2, spaNavCount: 1, reloadCount: 1 },
      summaryPrevious: EMPTY_SUMMARY,
      trend: [],
      topPages: [],
      topReferrers: [],
    });
    const svc = new DashboardVisitsService(visits);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.spaNavRatio).toBe(0.3333);
    expect(out.summary.reloadRatio).toBe(0.3333);
  });
});

describe("DashboardVisitsService / trend + tops", () => {
  it("trend 透传", async () => {
    const visits = createStubVisits({
      summaryCurrent: EMPTY_SUMMARY,
      summaryPrevious: EMPTY_SUMMARY,
      trend: [
        { hour: "2026-04-29T10:00:00.000Z", pv: 10, uv: 5 },
        { hour: "2026-04-29T11:00:00.000Z", pv: 20, uv: 8 },
      ],
      topPages: [],
      topReferrers: [],
    });
    const svc = new DashboardVisitsService(visits);
    const out = await svc.getOverview(QUERY);
    expect(out.trend).toEqual([
      { hour: "2026-04-29T10:00:00.000Z", pv: 10, uv: 5 },
      { hour: "2026-04-29T11:00:00.000Z", pv: 20, uv: 8 },
    ]);
  });

  it("topPages sharePercent round2", async () => {
    const visits = createStubVisits({
      summaryCurrent: EMPTY_SUMMARY,
      summaryPrevious: EMPTY_SUMMARY,
      trend: [],
      topPages: [
        { path: "/", pv: 60, uv: 30, sharePercent: 33.33333 },
        { path: "/settings", pv: 20, uv: 10, sharePercent: 11.11111 },
      ],
      topReferrers: [],
    });
    const svc = new DashboardVisitsService(visits);
    const out = await svc.getOverview(QUERY);
    expect(out.topPages).toEqual([
      { path: "/", pv: 60, uv: 30, sharePercent: 33.33 },
      { path: "/settings", pv: 20, uv: 10, sharePercent: 11.11 },
    ]);
  });

  it("topReferrers sharePercent round2", async () => {
    const visits = createStubVisits({
      summaryCurrent: EMPTY_SUMMARY,
      summaryPrevious: EMPTY_SUMMARY,
      trend: [],
      topPages: [],
      topReferrers: [
        { referrerHost: "google.com", pv: 30, sharePercent: 25.561 },
        { referrerHost: "direct", pv: 70, sharePercent: 74.449 },
      ],
    });
    const svc = new DashboardVisitsService(visits);
    const out = await svc.getOverview(QUERY);
    expect(out.topReferrers).toEqual([
      { referrerHost: "google.com", pv: 30, sharePercent: 25.56 },
      { referrerHost: "direct", pv: 70, sharePercent: 74.45 },
    ]);
  });
});

describe("DashboardVisitsService / 空窗口", () => {
  it("全零 summary + 空数组 trend/topPages/topReferrers", async () => {
    const visits = createStubVisits({
      summaryCurrent: EMPTY_SUMMARY,
      summaryPrevious: EMPTY_SUMMARY,
      trend: [],
      topPages: [],
      topReferrers: [],
    });
    const svc = new DashboardVisitsService(visits);
    const out = await svc.getOverview(QUERY);
    expect(out).toEqual({
      summary: {
        pv: 0,
        uv: 0,
        spaNavCount: 0,
        reloadCount: 0,
        spaNavRatio: 0,
        reloadRatio: 0,
        deltaPercent: 0,
        deltaDirection: "flat",
      },
      trend: [],
      topPages: [],
      topReferrers: [],
      dimensions: { browser: [], os: [], platform: [] },
    });
  });
});
