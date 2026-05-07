import { describe, it, expect } from "vitest";
import { DashboardResourcesService } from "../../../src/dashboard/monitor/resources.service.js";
import type {
  CategoryBucketRow,
  FailingHostRow,
  ResourcesService,
  ResourceSummaryRow,
  ResourceTrendRow,
  ResourceWindowParams,
  SlowResourceRow,
} from "../../../src/modules/resources/resources.service.js";
import type { ResourcesOverviewQuery } from "../../../src/dashboard/dto/resources-overview.dto.js";

/**
 * DashboardResourcesService 装配层单测（ADR-0022 §4 / TM.1.B.4）
 *
 * 装配层是纯拼装逻辑（无 DB 访问），通过注入 ResourcesService stub 覆盖：
 *  - summary delta（总样本 % + 失败率绝对差）三方向
 *  - categoryBuckets 透传 6 占位
 *  - trend / topSlow / topFailingHosts 透传 + round2/round4
 *  - 空窗口占位
 */

interface StubResource {
  summaryCurrent: ResourceSummaryRow;
  summaryPrevious: ResourceSummaryRow;
  buckets: CategoryBucketRow[];
  trend: ResourceTrendRow[];
  slow: SlowResourceRow[];
  failingHosts: FailingHostRow[];
}

function createStubService(stub: StubResource): ResourcesService {
  let summaryCallCount = 0;
  return {
    saveBatch: async () => 0,
    countForProject: async () => 0,
    aggregateSummary: async (_: ResourceWindowParams) => {
      summaryCallCount += 1;
      return summaryCallCount === 1
        ? stub.summaryCurrent
        : stub.summaryPrevious;
    },
    aggregateCategoryBuckets: async () => stub.buckets,
    aggregateTrend: async () => stub.trend,
    aggregateSlowResources: async () => stub.slow,
    aggregateFailingHosts: async () => stub.failingHosts,
    aggregateDimension: async () => [],
  } as unknown as ResourcesService;
}

const QUERY: ResourcesOverviewQuery = {
  projectId: "proj_test",
  windowHours: 24,
  limitSlow: 10,
  limitHosts: 10,
};

const EMPTY_SUMMARY: ResourceSummaryRow = {
  totalRequests: 0,
  failedCount: 0,
  slowCount: 0,
  p75DurationMs: 0,
  totalTransferBytes: 0,
};

const ZERO_BUCKETS: CategoryBucketRow[] = [
  "script",
  "stylesheet",
  "image",
  "font",
  "media",
  "other",
].map((c) => ({
  category: c,
  count: 0,
  failedCount: 0,
  slowCount: 0,
  avgDurationMs: 0,
}));

describe("DashboardResourcesService / summary 基础字段", () => {
  it("failureRatio / slowRatio 四舍五入到 4 位", async () => {
    const stub: StubResource = {
      summaryCurrent: {
        totalEvents: 0 as never,
        totalRequests: 1000,
        failedCount: 33,
        slowCount: 77,
        p75DurationMs: 812.456,
        totalTransferBytes: 2_000_000,
      } as ResourceSummaryRow,
      summaryPrevious: EMPTY_SUMMARY,
      buckets: ZERO_BUCKETS,
      trend: [],
      slow: [],
      failingHosts: [],
    };
    const dashboard = new DashboardResourcesService(createStubService(stub));
    const out = await dashboard.getOverview(QUERY);
    expect(out.summary.totalRequests).toBe(1000);
    expect(out.summary.failedCount).toBe(33);
    expect(out.summary.slowCount).toBe(77);
    expect(out.summary.p75DurationMs).toBe(812.46);
    expect(out.summary.failureRatio).toBe(0.033);
    expect(out.summary.slowRatio).toBe(0.077);
    expect(out.summary.totalTransferBytes).toBe(2_000_000);
  });
});

describe("DashboardResourcesService / summary delta", () => {
  it("current>previous → totalRequestsDirection=up", async () => {
    const stub: StubResource = {
      summaryCurrent: {
        totalRequests: 150,
        failedCount: 6,
        slowCount: 10,
        p75DurationMs: 800,
        totalTransferBytes: 1024,
      },
      summaryPrevious: {
        totalRequests: 100,
        failedCount: 2,
        slowCount: 5,
        p75DurationMs: 700,
        totalTransferBytes: 512,
      },
      buckets: ZERO_BUCKETS,
      trend: [],
      slow: [],
      failingHosts: [],
    };
    const dashboard = new DashboardResourcesService(createStubService(stub));
    const out = await dashboard.getOverview(QUERY);
    expect(out.summary.delta.totalRequestsDirection).toBe("up");
    expect(out.summary.delta.totalRequests).toBe(50);
    // 失败率：6/150=0.04；2/100=0.02；diff=+0.02
    expect(out.summary.delta.failureRatioDirection).toBe("up");
    expect(out.summary.delta.failureRatio).toBe(0.02);
  });

  it("current<previous → totalRequestsDirection=down", async () => {
    const stub: StubResource = {
      summaryCurrent: {
        totalRequests: 50,
        failedCount: 1,
        slowCount: 1,
        p75DurationMs: 600,
        totalTransferBytes: 256,
      },
      summaryPrevious: {
        totalRequests: 100,
        failedCount: 10,
        slowCount: 5,
        p75DurationMs: 700,
        totalTransferBytes: 512,
      },
      buckets: ZERO_BUCKETS,
      trend: [],
      slow: [],
      failingHosts: [],
    };
    const dashboard = new DashboardResourcesService(createStubService(stub));
    const out = await dashboard.getOverview(QUERY);
    expect(out.summary.delta.totalRequestsDirection).toBe("down");
    expect(out.summary.delta.totalRequests).toBe(50);
    // 失败率：1/50=0.02；10/100=0.1；diff=-0.08
    expect(out.summary.delta.failureRatioDirection).toBe("down");
    expect(out.summary.delta.failureRatio).toBe(0.08);
  });

  it("previous=0 或 current=0 → flat", async () => {
    const stub: StubResource = {
      summaryCurrent: {
        totalRequests: 10,
        failedCount: 0,
        slowCount: 0,
        p75DurationMs: 0,
        totalTransferBytes: 0,
      },
      summaryPrevious: EMPTY_SUMMARY,
      buckets: ZERO_BUCKETS,
      trend: [],
      slow: [],
      failingHosts: [],
    };
    const dashboard = new DashboardResourcesService(createStubService(stub));
    const out = await dashboard.getOverview(QUERY);
    expect(out.summary.delta.totalRequestsDirection).toBe("flat");
    expect(out.summary.delta.totalRequests).toBe(0);
    expect(out.summary.delta.failureRatioDirection).toBe("flat");
    expect(out.summary.delta.failureRatio).toBe(0);
  });
});

describe("DashboardResourcesService / 空窗口", () => {
  it("没有数据 → 6 占位 + 空数组", async () => {
    const stub: StubResource = {
      summaryCurrent: EMPTY_SUMMARY,
      summaryPrevious: EMPTY_SUMMARY,
      buckets: ZERO_BUCKETS,
      trend: [],
      slow: [],
      failingHosts: [],
    };
    const dashboard = new DashboardResourcesService(createStubService(stub));
    const out = await dashboard.getOverview(QUERY);

    expect(out.summary.totalRequests).toBe(0);
    expect(out.summary.failureRatio).toBe(0);
    expect(out.summary.slowRatio).toBe(0);
    expect(out.categoryBuckets).toHaveLength(6);
    expect(out.categoryBuckets.map((c) => c.category)).toEqual([
      "script",
      "stylesheet",
      "image",
      "font",
      "media",
      "other",
    ]);
    for (const c of out.categoryBuckets) {
      expect(c.count).toBe(0);
    }
    expect(out.trend).toHaveLength(0);
    expect(out.topSlow).toHaveLength(0);
    expect(out.topFailingHosts).toHaveLength(0);
  });
});

describe("DashboardResourcesService / topSlow & trend 透传", () => {
  it("avgDurationMs / p75DurationMs round2；failureRatio round4", async () => {
    const stub: StubResource = {
      summaryCurrent: {
        totalRequests: 200,
        failedCount: 10,
        slowCount: 20,
        p75DurationMs: 800,
        totalTransferBytes: 1024,
      },
      summaryPrevious: EMPTY_SUMMARY,
      buckets: ZERO_BUCKETS,
      trend: [
        {
          hour: "2026-04-29T10:00:00.000Z",
          count: 50,
          failedCount: 2,
          slowCount: 5,
          avgDurationMs: 312.456789,
        },
      ],
      slow: [
        {
          category: "script",
          host: "cdn.example.com",
          url: "https://cdn.example.com/app.js",
          sampleCount: 100,
          p75DurationMs: 850.7891,
          failureRatio: 0.12345678,
        },
      ],
      failingHosts: [
        {
          host: "cdn.broken.com",
          totalRequests: 20,
          failedCount: 18,
          failureRatio: 0.9,
        },
      ],
    };
    const dashboard = new DashboardResourcesService(createStubService(stub));
    const out = await dashboard.getOverview(QUERY);

    expect(out.trend[0].avgDurationMs).toBe(312.46);
    expect(out.topSlow[0].p75DurationMs).toBe(850.79);
    expect(out.topSlow[0].failureRatio).toBe(0.1235);
    expect(out.topFailingHosts[0].failureRatio).toBe(0.9);
  });
});
