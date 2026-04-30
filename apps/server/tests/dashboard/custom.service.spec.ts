import { describe, it, expect } from "vitest";
import { DashboardCustomService } from "../../src/dashboard/custom.service.js";
import type {
  CustomEventsService,
  CustomEventsSummaryRow,
  CustomEventTopPageRow,
  CustomEventTopRow,
  CustomEventTrendRow,
  CustomWindowParams,
} from "../../src/custom/custom-events.service.js";
import type {
  CustomMetricsService,
  CustomMetricsSummaryRow,
  CustomMetricTopRow,
  CustomMetricTrendRow,
} from "../../src/custom/custom-metrics.service.js";
import type { CustomOverviewQuery } from "../../src/dashboard/dto/custom-overview.dto.js";

/**
 * DashboardCustomService 装配层单测（ADR-0023 §4 / TM.1.C.4）
 *
 * 装配层是纯拼装逻辑（无 DB 访问），通过注入两个领域 Service stub 覆盖：
 *  - summary delta（事件/指标双 %）三方向
 *  - topN / trend 透传 + round2
 *  - topPages 透传
 *  - 空窗口全部零/空填充
 */

interface StubEvents {
  summaryCurrent: CustomEventsSummaryRow;
  summaryPrevious: CustomEventsSummaryRow;
  topEvents: CustomEventTopRow[];
  trend: CustomEventTrendRow[];
  topPages: CustomEventTopPageRow[];
}

interface StubMetrics {
  summaryCurrent: CustomMetricsSummaryRow;
  summaryPrevious: CustomMetricsSummaryRow;
  topMetrics: CustomMetricTopRow[];
  trend: CustomMetricTrendRow[];
}

function createStubEvents(stub: StubEvents): CustomEventsService {
  let summaryCallCount = 0;
  return {
    saveBatch: async () => 0,
    countForProject: async () => 0,
    aggregateSummary: async (_: CustomWindowParams) => {
      summaryCallCount += 1;
      return summaryCallCount === 1
        ? stub.summaryCurrent
        : stub.summaryPrevious;
    },
    aggregateTopEvents: async () => stub.topEvents,
    aggregateTrend: async () => stub.trend,
    aggregateTopPages: async () => stub.topPages,
  } as unknown as CustomEventsService;
}

function createStubMetrics(stub: StubMetrics): CustomMetricsService {
  let summaryCallCount = 0;
  return {
    saveBatch: async () => 0,
    countForProject: async () => 0,
    aggregateSummary: async (_: CustomWindowParams) => {
      summaryCallCount += 1;
      return summaryCallCount === 1
        ? stub.summaryCurrent
        : stub.summaryPrevious;
    },
    aggregateTopMetrics: async () => stub.topMetrics,
    aggregateTrend: async () => stub.trend,
  } as unknown as CustomMetricsService;
}

const QUERY: CustomOverviewQuery = {
  projectId: "proj_test",
  windowHours: 24,
  limitEvents: 10,
  limitMetrics: 10,
  limitPages: 10,
};

const EMPTY_EVENTS_SUMMARY: CustomEventsSummaryRow = {
  totalEvents: 0,
  distinctNames: 0,
  topEventName: null,
  avgPerSession: 0,
};
const EMPTY_METRICS_SUMMARY: CustomMetricsSummaryRow = {
  totalSamples: 0,
  distinctNames: 0,
  globalP75: 0,
  globalP95: 0,
};

describe("DashboardCustomService / summary + delta", () => {
  it("正向环比：events +100% / samples +50%", async () => {
    const events = createStubEvents({
      summaryCurrent: {
        totalEvents: 400,
        distinctNames: 20,
        topEventName: "checkout",
        avgPerSession: 8,
      },
      summaryPrevious: {
        totalEvents: 200,
        distinctNames: 10,
        topEventName: "view",
        avgPerSession: 4,
      },
      topEvents: [],
      trend: [],
      topPages: [],
    });
    const metrics = createStubMetrics({
      summaryCurrent: {
        totalSamples: 900,
        distinctNames: 6,
        globalP75: 345.678,
        globalP95: 999.1,
      },
      summaryPrevious: {
        totalSamples: 600,
        distinctNames: 6,
        globalP75: 300,
        globalP95: 900,
      },
      topMetrics: [],
      trend: [],
    });
    const svc = new DashboardCustomService(events, metrics);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.totalEvents).toBe(400);
    expect(out.summary.topEventName).toBe("checkout");
    expect(out.summary.avgEventsPerSession).toBe(8);
    expect(out.summary.globalP75DurationMs).toBe(345.68);
    expect(out.summary.globalP95DurationMs).toBe(999.1);
    expect(out.summary.delta).toEqual({
      totalEvents: 100,
      totalEventsDirection: "up",
      totalSamples: 50,
      totalSamplesDirection: "up",
    });
  });

  it("反向环比：events -25% / samples down", async () => {
    const events = createStubEvents({
      summaryCurrent: {
        totalEvents: 75,
        distinctNames: 3,
        topEventName: "a",
        avgPerSession: 1.5,
      },
      summaryPrevious: {
        totalEvents: 100,
        distinctNames: 3,
        topEventName: "a",
        avgPerSession: 2,
      },
      topEvents: [],
      trend: [],
      topPages: [],
    });
    const metrics = createStubMetrics({
      summaryCurrent: {
        totalSamples: 80,
        distinctNames: 2,
        globalP75: 200,
        globalP95: 500,
      },
      summaryPrevious: {
        totalSamples: 100,
        distinctNames: 2,
        globalP75: 220,
        globalP95: 550,
      },
      topMetrics: [],
      trend: [],
    });
    const svc = new DashboardCustomService(events, metrics);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.delta.totalEventsDirection).toBe("down");
    expect(out.summary.delta.totalEvents).toBe(25);
    expect(out.summary.delta.totalSamplesDirection).toBe("down");
    expect(out.summary.delta.totalSamples).toBe(20);
  });

  it("previous=0 → delta=flat", async () => {
    const events = createStubEvents({
      summaryCurrent: {
        totalEvents: 10,
        distinctNames: 1,
        topEventName: "x",
        avgPerSession: 1,
      },
      summaryPrevious: EMPTY_EVENTS_SUMMARY,
      topEvents: [],
      trend: [],
      topPages: [],
    });
    const metrics = createStubMetrics({
      summaryCurrent: {
        totalSamples: 5,
        distinctNames: 1,
        globalP75: 100,
        globalP95: 200,
      },
      summaryPrevious: EMPTY_METRICS_SUMMARY,
      topMetrics: [],
      trend: [],
    });
    const svc = new DashboardCustomService(events, metrics);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.delta).toEqual({
      totalEvents: 0,
      totalEventsDirection: "flat",
      totalSamples: 0,
      totalSamplesDirection: "flat",
    });
  });

  it("空窗口：summary 全零；topN / trend / topPages 空数组", async () => {
    const events = createStubEvents({
      summaryCurrent: EMPTY_EVENTS_SUMMARY,
      summaryPrevious: EMPTY_EVENTS_SUMMARY,
      topEvents: [],
      trend: [],
      topPages: [],
    });
    const metrics = createStubMetrics({
      summaryCurrent: EMPTY_METRICS_SUMMARY,
      summaryPrevious: EMPTY_METRICS_SUMMARY,
      topMetrics: [],
      trend: [],
    });
    const svc = new DashboardCustomService(events, metrics);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.totalEvents).toBe(0);
    expect(out.summary.topEventName).toBeNull();
    expect(out.summary.avgEventsPerSession).toBe(0);
    expect(out.summary.globalP75DurationMs).toBe(0);
    expect(out.eventsTopN).toEqual([]);
    expect(out.metricsTopN).toEqual([]);
    expect(out.eventsTrend).toEqual([]);
    expect(out.metricsTrend).toEqual([]);
    expect(out.topPages).toEqual([]);
  });
});

describe("DashboardCustomService / eventsTopN", () => {
  it("透传并保持顺序", async () => {
    const events = createStubEvents({
      summaryCurrent: EMPTY_EVENTS_SUMMARY,
      summaryPrevious: EMPTY_EVENTS_SUMMARY,
      topEvents: [
        { name: "checkout", count: 120, lastSeenMs: 1_700_000_003_000_000 },
        { name: "view", count: 80, lastSeenMs: 1_700_000_002_000_000 },
      ],
      trend: [],
      topPages: [],
    });
    const metrics = createStubMetrics({
      summaryCurrent: EMPTY_METRICS_SUMMARY,
      summaryPrevious: EMPTY_METRICS_SUMMARY,
      topMetrics: [],
      trend: [],
    });
    const svc = new DashboardCustomService(events, metrics);
    const out = await svc.getOverview(QUERY);
    expect(out.eventsTopN).toEqual([
      { name: "checkout", count: 120, lastSeenMs: 1_700_000_003_000_000 },
      { name: "view", count: 80, lastSeenMs: 1_700_000_002_000_000 },
    ]);
  });
});

describe("DashboardCustomService / metricsTopN", () => {
  it("p50/p75/p95/avg 四舍五入 2 位", async () => {
    const events = createStubEvents({
      summaryCurrent: EMPTY_EVENTS_SUMMARY,
      summaryPrevious: EMPTY_EVENTS_SUMMARY,
      topEvents: [],
      trend: [],
      topPages: [],
    });
    const metrics = createStubMetrics({
      summaryCurrent: EMPTY_METRICS_SUMMARY,
      summaryPrevious: EMPTY_METRICS_SUMMARY,
      topMetrics: [
        {
          name: "loadCheckout",
          count: 120,
          p50: 200.123,
          p75: 350.999,
          p95: 900.555,
          avgDurationMs: 260.1,
        },
      ],
      trend: [],
    });
    const svc = new DashboardCustomService(events, metrics);
    const out = await svc.getOverview(QUERY);
    expect(out.metricsTopN).toEqual([
      {
        name: "loadCheckout",
        count: 120,
        p50DurationMs: 200.12,
        p75DurationMs: 351,
        p95DurationMs: 900.56,
        avgDurationMs: 260.1,
      },
    ]);
  });
});

describe("DashboardCustomService / trend 透传", () => {
  it("eventsTrend + metricsTrend 双轨透传", async () => {
    const events = createStubEvents({
      summaryCurrent: EMPTY_EVENTS_SUMMARY,
      summaryPrevious: EMPTY_EVENTS_SUMMARY,
      topEvents: [],
      trend: [
        { hour: "2026-04-29T10:00:00.000Z", count: 12 },
        { hour: "2026-04-29T11:00:00.000Z", count: 8 },
      ],
      topPages: [],
    });
    const metrics = createStubMetrics({
      summaryCurrent: EMPTY_METRICS_SUMMARY,
      summaryPrevious: EMPTY_METRICS_SUMMARY,
      topMetrics: [],
      trend: [
        {
          hour: "2026-04-29T10:00:00.000Z",
          count: 40,
          avgDurationMs: 200.456,
        },
      ],
    });
    const svc = new DashboardCustomService(events, metrics);
    const out = await svc.getOverview(QUERY);
    expect(out.eventsTrend).toEqual([
      { hour: "2026-04-29T10:00:00.000Z", count: 12 },
      { hour: "2026-04-29T11:00:00.000Z", count: 8 },
    ]);
    expect(out.metricsTrend).toEqual([
      {
        hour: "2026-04-29T10:00:00.000Z",
        count: 40,
        avgDurationMs: 200.46,
      },
    ]);
  });
});

describe("DashboardCustomService / topPages 透传", () => {
  it("保持顺序", async () => {
    const events = createStubEvents({
      summaryCurrent: EMPTY_EVENTS_SUMMARY,
      summaryPrevious: EMPTY_EVENTS_SUMMARY,
      topEvents: [],
      trend: [],
      topPages: [
        { pagePath: "/checkout", count: 60 },
        { pagePath: "/product", count: 40 },
      ],
    });
    const metrics = createStubMetrics({
      summaryCurrent: EMPTY_METRICS_SUMMARY,
      summaryPrevious: EMPTY_METRICS_SUMMARY,
      topMetrics: [],
      trend: [],
    });
    const svc = new DashboardCustomService(events, metrics);
    const out = await svc.getOverview(QUERY);
    expect(out.topPages).toEqual([
      { pagePath: "/checkout", count: 60 },
      { pagePath: "/product", count: 40 },
    ]);
  });
});

describe("DashboardCustomService / current=0 previous>0", () => {
  it("delta 方向为 flat（按 resources 相同规则）", async () => {
    const events = createStubEvents({
      summaryCurrent: EMPTY_EVENTS_SUMMARY,
      summaryPrevious: {
        totalEvents: 100,
        distinctNames: 5,
        topEventName: "x",
        avgPerSession: 2,
      },
      topEvents: [],
      trend: [],
      topPages: [],
    });
    const metrics = createStubMetrics({
      summaryCurrent: EMPTY_METRICS_SUMMARY,
      summaryPrevious: {
        totalSamples: 50,
        distinctNames: 2,
        globalP75: 200,
        globalP95: 400,
      },
      topMetrics: [],
      trend: [],
    });
    const svc = new DashboardCustomService(events, metrics);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.delta.totalEventsDirection).toBe("flat");
    expect(out.summary.delta.totalSamplesDirection).toBe("flat");
  });
});
