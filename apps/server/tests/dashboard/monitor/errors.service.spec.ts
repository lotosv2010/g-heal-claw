import { describe, it, expect } from "vitest";
import { DashboardErrorsService } from "../../../src/dashboard/monitor/errors.service.js";
import type {
  CategoryCountRow,
  CategoryTrendRow,
  DimensionRow,
  ErrorSummaryRow,
  ErrorWindowParams,
  ErrorsService,
  SubTypeCountRow,
  SupportedDimensionColumn,
  TopGroupRow,
  TrendRow,
} from "../../../src/modules/errors/errors.service.js";
import type { ErrorsOverviewQuery } from "../../../src/dashboard/dto/errors-overview.dto.js";

/**
 * DashboardErrorsService 装配层单测（ADR-0019）
 *
 * 装配层是纯拼装逻辑（无 DB 访问），通过注入 ErrorsService stub 覆盖：
 *  - 9 分类 ratio 计算
 *  - resource.kind NULL 兜底 → js_load
 *  - 空窗口：9 卡占位 + 空 trend + 空维度
 *  - delta direction (up/down/flat)
 *
 * 不违反"集成测试禁止 mock 数据库"：ErrorsService 是服务级协作者，非 DB。
 */

interface StubErrors {
  summaryCurrent: ErrorSummaryRow;
  summaryPrevious: ErrorSummaryRow;
  bySubType: SubTypeCountRow[];
  trend: TrendRow[];
  byCategory: CategoryCountRow[];
  categoryTrend: CategoryTrendRow[];
  topGroups: TopGroupRow[];
  browser: DimensionRow[];
  os: DimensionRow[];
  device: DimensionRow[];
}

function createStubService(stub: StubErrors): ErrorsService {
  let summaryCallCount = 0;
  return {
    saveBatch: async () => 0,
    countForProject: async () => 0,
    aggregateSummary: async (_: ErrorWindowParams) => {
      summaryCallCount += 1;
      return summaryCallCount === 1
        ? stub.summaryCurrent
        : stub.summaryPrevious;
    },
    aggregateBySubType: async () => stub.bySubType,
    aggregateTrend: async () => stub.trend,
    aggregateByCategory: async () => stub.byCategory,
    aggregateCategoryTrend: async () => stub.categoryTrend,
    aggregateTopGroups: async () => stub.topGroups,
    aggregateDimension: async (
      _: ErrorWindowParams,
      col: SupportedDimensionColumn,
    ) => {
      if (col === "browser") return stub.browser;
      if (col === "os") return stub.os;
      return stub.device;
    },
  } as unknown as ErrorsService;
}

const QUERY: ErrorsOverviewQuery = {
  projectId: "proj_test",
  windowHours: 24,
  limitGroups: 10,
};

describe("DashboardErrorsService / 9 分类映射", () => {
  it("categories 覆盖 9 项且 ratio 四舍五入", async () => {
    const stub: StubErrors = {
      summaryCurrent: { totalEvents: 100, impactedSessions: 30 },
      summaryPrevious: { totalEvents: 80, impactedSessions: 25 },
      bySubType: [],
      trend: [],
      byCategory: [
        { subType: "js", resourceKind: null, count: 20 },
        { subType: "promise", resourceKind: null, count: 10 },
        { subType: "white_screen", resourceKind: null, count: 5 },
        { subType: "ajax", resourceKind: null, count: 15 },
        { subType: "api_code", resourceKind: null, count: 10 },
        { subType: "resource", resourceKind: "js_load", count: 12 },
        { subType: "resource", resourceKind: "image_load", count: 18 },
        { subType: "resource", resourceKind: "css_load", count: 6 },
        { subType: "resource", resourceKind: "media", count: 4 },
      ],
      categoryTrend: [],
      topGroups: [],
      browser: [],
      os: [],
      device: [],
    };
    const dashboard = new DashboardErrorsService(createStubService(stub));

    const out = await dashboard.getOverview(QUERY);

    expect(out.categories).toHaveLength(9);
    const js = out.categories.find((c) => c.category === "js");
    expect(js?.count).toBe(20);
    expect(js?.ratio).toBeCloseTo(0.2, 4);
    expect(
      out.categories.find((c) => c.category === "image_load")?.count,
    ).toBe(18);
  });

  it("resource.kind=null / other → 归入 js_load", async () => {
    const stub: StubErrors = {
      summaryCurrent: { totalEvents: 10, impactedSessions: 5 },
      summaryPrevious: { totalEvents: 10, impactedSessions: 5 },
      bySubType: [],
      trend: [],
      byCategory: [
        { subType: "resource", resourceKind: null, count: 4 },
        { subType: "resource", resourceKind: "other", count: 3 },
      ],
      categoryTrend: [],
      topGroups: [],
      browser: [],
      os: [],
      device: [],
    };
    const dashboard = new DashboardErrorsService(createStubService(stub));

    const out = await dashboard.getOverview(QUERY);

    // 4 + 3 = 7 都落到 js_load
    expect(out.categories.find((c) => c.category === "js_load")?.count).toBe(7);
    expect(
      out.categories.find((c) => c.category === "image_load")?.count,
    ).toBe(0);
  });
});

describe("DashboardErrorsService / summary delta", () => {
  it("current>previous → direction=up", async () => {
    const stub: StubErrors = {
      summaryCurrent: { totalEvents: 150, impactedSessions: 40 },
      summaryPrevious: { totalEvents: 100, impactedSessions: 30 },
      bySubType: [],
      trend: [],
      byCategory: [],
      categoryTrend: [],
      topGroups: [],
      browser: [],
      os: [],
      device: [],
    };
    const dashboard = new DashboardErrorsService(createStubService(stub));
    const out = await dashboard.getOverview(QUERY);
    expect(out.summary.deltaDirection).toBe("up");
    expect(out.summary.deltaPercent).toBe(50);
  });

  it("current<previous → direction=down", async () => {
    const stub: StubErrors = {
      summaryCurrent: { totalEvents: 50, impactedSessions: 10 },
      summaryPrevious: { totalEvents: 100, impactedSessions: 30 },
      bySubType: [],
      trend: [],
      byCategory: [],
      categoryTrend: [],
      topGroups: [],
      browser: [],
      os: [],
      device: [],
    };
    const dashboard = new DashboardErrorsService(createStubService(stub));
    const out = await dashboard.getOverview(QUERY);
    expect(out.summary.deltaDirection).toBe("down");
    expect(out.summary.deltaPercent).toBe(50);
  });

  it("previous=0 或 current=0 → direction=flat, percent=0", async () => {
    const stub: StubErrors = {
      summaryCurrent: { totalEvents: 10, impactedSessions: 5 },
      summaryPrevious: { totalEvents: 0, impactedSessions: 0 },
      bySubType: [],
      trend: [],
      byCategory: [],
      categoryTrend: [],
      topGroups: [],
      browser: [],
      os: [],
      device: [],
    };
    const dashboard = new DashboardErrorsService(createStubService(stub));
    const out = await dashboard.getOverview(QUERY);
    expect(out.summary.deltaDirection).toBe("flat");
    expect(out.summary.deltaPercent).toBe(0);
  });
});

describe("DashboardErrorsService / 空窗口占位", () => {
  it("总数为 0 → categories 9 项全 0，ratio=0", async () => {
    const stub: StubErrors = {
      summaryCurrent: { totalEvents: 0, impactedSessions: 0 },
      summaryPrevious: { totalEvents: 0, impactedSessions: 0 },
      bySubType: [],
      trend: [],
      byCategory: [],
      categoryTrend: [],
      topGroups: [],
      browser: [],
      os: [],
      device: [],
    };
    const dashboard = new DashboardErrorsService(createStubService(stub));
    const out = await dashboard.getOverview(QUERY);

    expect(out.summary.totalEvents).toBe(0);
    expect(out.categories).toHaveLength(9);
    for (const c of out.categories) {
      expect(c.count).toBe(0);
      expect(c.ratio).toBe(0);
    }
    expect(out.bySubType).toHaveLength(5);
    expect(out.trend).toHaveLength(0);
    expect(out.categoryTrend).toHaveLength(0);
    // 8 维度 key 全在，未采集维度返回空数组
    const keys = Object.keys(out.dimensions);
    expect(keys).toHaveLength(8);
    expect(out.dimensions.version).toHaveLength(0);
  });
});

describe("DashboardErrorsService / topGroups 映射", () => {
  it("topGroups 每行补齐 category 字段", async () => {
    const stub: StubErrors = {
      summaryCurrent: { totalEvents: 5, impactedSessions: 2 },
      summaryPrevious: { totalEvents: 5, impactedSessions: 2 },
      bySubType: [],
      trend: [],
      byCategory: [],
      categoryTrend: [],
      topGroups: [
        {
          subType: "resource",
          resourceKind: "image_load",
          messageHead: "Resource load failed: <img>",
          count: 3,
          impactedSessions: 2,
          firstSeenMs: 1700000000000,
          lastSeenMs: 1700000100000,
          samplePath: "/home",
        },
        {
          subType: "ajax",
          resourceKind: null,
          messageHead: "Ajax 404: GET /api/x",
          count: 2,
          impactedSessions: 1,
          firstSeenMs: 1700000200000,
          lastSeenMs: 1700000300000,
          samplePath: "/api/x",
        },
      ],
      browser: [],
      os: [],
      device: [],
    };
    const dashboard = new DashboardErrorsService(createStubService(stub));
    const out = await dashboard.getOverview(QUERY);

    expect(out.topGroups).toHaveLength(2);
    expect(out.topGroups[0].category).toBe("image_load");
    expect(out.topGroups[0].firstSeen).toMatch(/^2023-/);
    expect(out.topGroups[1].category).toBe("ajax");
  });
});
