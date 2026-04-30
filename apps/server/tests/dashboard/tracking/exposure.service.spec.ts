import { describe, it, expect } from "vitest";
import { DashboardExposureService } from "../../../src/dashboard/tracking/exposure.service.js";
import type {
  TrackingService,
  ExposureSummaryRow,
  TopExposureSelectorRow,
  TopTrackPageRow,
  TrackTrendRow,
  TrackWindowParams,
} from "../../../src/modules/tracking/tracking.service.js";
import type { ExposureOverviewQuery } from "../../../src/dashboard/dto/exposure-overview.dto.js";

/**
 * DashboardExposureService 装配层单测（ADR-0024）
 *
 * 覆盖：
 *  - summary 环比三方向（up / down / flat）
 *  - exposuresPerUser 除零保护
 *  - trend / topSelectors / topPages 透传
 *  - 空窗口全零 + 空数组
 */

interface Stub {
  summaryCurrent: ExposureSummaryRow;
  summaryPrevious: ExposureSummaryRow;
  trend: TrackTrendRow[];
  topSelectors: TopExposureSelectorRow[];
  topPages: TopTrackPageRow[];
}

function createStubTracking(stub: Stub): TrackingService {
  let summaryCallCount = 0;
  return {
    saveBatch: async () => 0,
    countForProject: async () => 0,
    aggregateSummary: async () => ({
      totalEvents: 0,
      uniqueUsers: 0,
      uniqueSessions: 0,
      uniqueEventNames: 0,
    }),
    aggregateTypeBuckets: async () => [],
    aggregateTrend: async () => [],
    aggregateTopEvents: async () => [],
    aggregateTopPages: async () => [],
    aggregateExposureSummary: async (_: TrackWindowParams) => {
      summaryCallCount += 1;
      return summaryCallCount === 1 ? stub.summaryCurrent : stub.summaryPrevious;
    },
    aggregateExposureTrend: async () => stub.trend,
    aggregateTopExposureSelectors: async () => stub.topSelectors,
    aggregateTopExposurePages: async () => stub.topPages,
  } as unknown as TrackingService;
}

const QUERY: ExposureOverviewQuery = {
  projectId: "proj_test",
  windowHours: 24,
  limitSelectors: 10,
  limitPages: 10,
};

const EMPTY_SUMMARY: ExposureSummaryRow = {
  totalExposures: 0,
  uniqueSelectors: 0,
  uniquePages: 0,
  uniqueUsers: 0,
};

describe("DashboardExposureService / summary + delta", () => {
  it("正向环比：exposures +100%", async () => {
    const tracking = createStubTracking({
      summaryCurrent: {
        totalExposures: 200,
        uniqueSelectors: 12,
        uniquePages: 3,
        uniqueUsers: 40,
      },
      summaryPrevious: {
        totalExposures: 100,
        uniqueSelectors: 10,
        uniquePages: 3,
        uniqueUsers: 30,
      },
      trend: [],
      topSelectors: [],
      topPages: [],
    });
    const svc = new DashboardExposureService(tracking);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.totalExposures).toBe(200);
    expect(out.summary.uniqueSelectors).toBe(12);
    expect(out.summary.uniquePages).toBe(3);
    expect(out.summary.uniqueUsers).toBe(40);
    expect(out.summary.exposuresPerUser).toBe(5);
    expect(out.summary.deltaPercent).toBe(100);
    expect(out.summary.deltaDirection).toBe("up");
  });

  it("反向环比：exposures -25%", async () => {
    const tracking = createStubTracking({
      summaryCurrent: {
        totalExposures: 75,
        uniqueSelectors: 5,
        uniquePages: 2,
        uniqueUsers: 15,
      },
      summaryPrevious: {
        totalExposures: 100,
        uniqueSelectors: 5,
        uniquePages: 2,
        uniqueUsers: 20,
      },
      trend: [],
      topSelectors: [],
      topPages: [],
    });
    const svc = new DashboardExposureService(tracking);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.deltaDirection).toBe("down");
    expect(out.summary.deltaPercent).toBe(25);
    expect(out.summary.exposuresPerUser).toBe(5);
  });

  it("previous=0 → delta flat", async () => {
    const tracking = createStubTracking({
      summaryCurrent: {
        totalExposures: 30,
        uniqueSelectors: 2,
        uniquePages: 1,
        uniqueUsers: 10,
      },
      summaryPrevious: EMPTY_SUMMARY,
      trend: [],
      topSelectors: [],
      topPages: [],
    });
    const svc = new DashboardExposureService(tracking);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.deltaDirection).toBe("flat");
    expect(out.summary.deltaPercent).toBe(0);
  });

  it("uniqueUsers=0 → exposuresPerUser=0（除零保护）", async () => {
    const tracking = createStubTracking({
      summaryCurrent: {
        totalExposures: 50,
        uniqueSelectors: 3,
        uniquePages: 2,
        uniqueUsers: 0,
      },
      summaryPrevious: EMPTY_SUMMARY,
      trend: [],
      topSelectors: [],
      topPages: [],
    });
    const svc = new DashboardExposureService(tracking);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.exposuresPerUser).toBe(0);
  });

  it("空窗口：summary 全零；trend / topSelectors / topPages 空", async () => {
    const tracking = createStubTracking({
      summaryCurrent: EMPTY_SUMMARY,
      summaryPrevious: EMPTY_SUMMARY,
      trend: [],
      topSelectors: [],
      topPages: [],
    });
    const svc = new DashboardExposureService(tracking);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.totalExposures).toBe(0);
    expect(out.summary.exposuresPerUser).toBe(0);
    expect(out.summary.deltaDirection).toBe("flat");
    expect(out.trend).toEqual([]);
    expect(out.topSelectors).toEqual([]);
    expect(out.topPages).toEqual([]);
  });
});

describe("DashboardExposureService / 透传", () => {
  it("topSelectors sharePercent 四舍五入 2 位，其余字段原样", async () => {
    const tracking = createStubTracking({
      summaryCurrent: EMPTY_SUMMARY,
      summaryPrevious: EMPTY_SUMMARY,
      trend: [],
      topSelectors: [
        {
          selector: "[data-track-expose=\"promo_hero\"]",
          sampleText: "限时 5 折",
          count: 120,
          uniqueUsers: 80,
          uniquePages: 2,
          sharePercent: 42.123456,
        },
        {
          selector: "button.cta",
          sampleText: null,
          count: 60,
          uniqueUsers: 40,
          uniquePages: 1,
          sharePercent: 20.005,
        },
      ],
      topPages: [],
    });
    const svc = new DashboardExposureService(tracking);
    const out = await svc.getOverview(QUERY);
    expect(out.topSelectors).toEqual([
      {
        selector: "[data-track-expose=\"promo_hero\"]",
        sampleText: "限时 5 折",
        count: 120,
        uniqueUsers: 80,
        uniquePages: 2,
        sharePercent: 42.12,
      },
      {
        selector: "button.cta",
        sampleText: null,
        count: 60,
        uniqueUsers: 40,
        uniquePages: 1,
        sharePercent: 20.01,
      },
    ]);
  });

  it("trend / topPages 透传保持顺序", async () => {
    const tracking = createStubTracking({
      summaryCurrent: EMPTY_SUMMARY,
      summaryPrevious: EMPTY_SUMMARY,
      trend: [
        { hour: "2026-04-29T10:00:00.000Z", count: 10, uniqueUsers: 5 },
        { hour: "2026-04-29T11:00:00.000Z", count: 12, uniqueUsers: 7 },
      ],
      topSelectors: [],
      topPages: [
        { pagePath: "/home", count: 80, uniqueUsers: 40 },
        { pagePath: "/product", count: 50, uniqueUsers: 25 },
      ],
    });
    const svc = new DashboardExposureService(tracking);
    const out = await svc.getOverview(QUERY);
    expect(out.trend).toEqual([
      { hour: "2026-04-29T10:00:00.000Z", count: 10, uniqueUsers: 5 },
      { hour: "2026-04-29T11:00:00.000Z", count: 12, uniqueUsers: 7 },
    ]);
    expect(out.topPages).toEqual([
      { pagePath: "/home", count: 80, uniqueUsers: 40 },
      { pagePath: "/product", count: 50, uniqueUsers: 25 },
    ]);
  });
});
