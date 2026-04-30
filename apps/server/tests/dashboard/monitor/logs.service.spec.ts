import { describe, it, expect } from "vitest";
import { DashboardLogsService } from "../../../src/dashboard/monitor/logs.service.js";
import type {
  LogLevelBucketRow,
  LogsService,
  LogsSummaryRow,
  LogsWindowParams,
  LogTopMessageRow,
  LogTrendRow,
} from "../../../src/modules/logs/logs.service.js";
import type { LogsOverviewQuery } from "../../../src/dashboard/dto/logs-overview.dto.js";

/**
 * DashboardLogsService 装配层单测（ADR-0023 §4 / TM.1.C.4）
 *
 * 覆盖：
 *  - summary delta（总数 % + errorRatio 绝对差 pp）
 *  - levelBuckets 透传 3 固定级别
 *  - trend 三折线透传
 *  - topMessages 透传
 *  - 空窗口零/空填充
 */

interface StubLogs {
  summaryCurrent: LogsSummaryRow;
  summaryPrevious: LogsSummaryRow;
  buckets: LogLevelBucketRow[];
  trend: LogTrendRow[];
  topMessages: LogTopMessageRow[];
}

function createStubService(stub: StubLogs): LogsService {
  let summaryCallCount = 0;
  return {
    saveBatch: async () => 0,
    countForProject: async () => 0,
    aggregateSummary: async (_: LogsWindowParams) => {
      summaryCallCount += 1;
      return summaryCallCount === 1
        ? stub.summaryCurrent
        : stub.summaryPrevious;
    },
    aggregateLevelBuckets: async () => stub.buckets,
    aggregateTrend: async () => stub.trend,
    aggregateTopMessages: async () => stub.topMessages,
  } as unknown as LogsService;
}

const QUERY: LogsOverviewQuery = {
  projectId: "proj_test",
  windowHours: 24,
  limitMessages: 10,
};

const EMPTY_SUMMARY: LogsSummaryRow = {
  totalLogs: 0,
  errorCount: 0,
  warnCount: 0,
  infoCount: 0,
  errorRatio: 0,
};

const ZERO_BUCKETS: LogLevelBucketRow[] = [
  { level: "info", count: 0 },
  { level: "warn", count: 0 },
  { level: "error", count: 0 },
];

describe("DashboardLogsService / summary + delta", () => {
  it("正向环比：total +100% / errorRatio +pp up", async () => {
    const stub = createStubService({
      summaryCurrent: {
        totalLogs: 200,
        errorCount: 40,
        warnCount: 60,
        infoCount: 100,
        errorRatio: 0.2,
      },
      summaryPrevious: {
        totalLogs: 100,
        errorCount: 10,
        warnCount: 20,
        infoCount: 70,
        errorRatio: 0.1,
      },
      buckets: ZERO_BUCKETS,
      trend: [],
      topMessages: [],
    });
    const svc = new DashboardLogsService(stub);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.totalLogs).toBe(200);
    expect(out.summary.errorCount).toBe(40);
    expect(out.summary.errorRatio).toBe(0.2);
    expect(out.summary.delta).toEqual({
      totalLogs: 100,
      totalLogsDirection: "up",
      errorRatio: 0.1,
      errorRatioDirection: "up",
    });
  });

  it("反向环比：total -50% / errorRatio -pp down", async () => {
    const stub = createStubService({
      summaryCurrent: {
        totalLogs: 50,
        errorCount: 5,
        warnCount: 10,
        infoCount: 35,
        errorRatio: 0.1,
      },
      summaryPrevious: {
        totalLogs: 100,
        errorCount: 30,
        warnCount: 20,
        infoCount: 50,
        errorRatio: 0.3,
      },
      buckets: ZERO_BUCKETS,
      trend: [],
      topMessages: [],
    });
    const svc = new DashboardLogsService(stub);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.delta.totalLogsDirection).toBe("down");
    expect(out.summary.delta.totalLogs).toBe(50);
    expect(out.summary.delta.errorRatioDirection).toBe("down");
    expect(out.summary.delta.errorRatio).toBe(0.2);
  });

  it("previous=0 → totalLogs delta flat；errorRatio diff < 0.0001 → flat", async () => {
    const stub = createStubService({
      summaryCurrent: {
        totalLogs: 10,
        errorCount: 1,
        warnCount: 2,
        infoCount: 7,
        errorRatio: 0.1,
      },
      summaryPrevious: {
        totalLogs: 0,
        errorCount: 0,
        warnCount: 0,
        infoCount: 0,
        errorRatio: 0.1,
      },
      buckets: ZERO_BUCKETS,
      trend: [],
      topMessages: [],
    });
    const svc = new DashboardLogsService(stub);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.delta).toEqual({
      totalLogs: 0,
      totalLogsDirection: "flat",
      errorRatio: 0,
      errorRatioDirection: "flat",
    });
  });

  it("errorRatio round4（0.33333 → 0.3333）", async () => {
    const stub = createStubService({
      summaryCurrent: {
        totalLogs: 3,
        errorCount: 1,
        warnCount: 1,
        infoCount: 1,
        errorRatio: 0.33333,
      },
      summaryPrevious: EMPTY_SUMMARY,
      buckets: ZERO_BUCKETS,
      trend: [],
      topMessages: [],
    });
    const svc = new DashboardLogsService(stub);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.errorRatio).toBe(0.3333);
  });

  it("空窗口：summary 全零；levelBuckets 3 占位；trend/topMessages 空", async () => {
    const stub = createStubService({
      summaryCurrent: EMPTY_SUMMARY,
      summaryPrevious: EMPTY_SUMMARY,
      buckets: ZERO_BUCKETS,
      trend: [],
      topMessages: [],
    });
    const svc = new DashboardLogsService(stub);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.totalLogs).toBe(0);
    expect(out.summary.errorRatio).toBe(0);
    expect(out.levelBuckets).toHaveLength(3);
    expect(out.levelBuckets.map((r) => r.level)).toEqual([
      "info",
      "warn",
      "error",
    ]);
    expect(out.trend).toEqual([]);
    expect(out.topMessages).toEqual([]);
  });
});

describe("DashboardLogsService / levelBuckets 透传", () => {
  it("保持 3 级别固定顺序", async () => {
    const stub = createStubService({
      summaryCurrent: EMPTY_SUMMARY,
      summaryPrevious: EMPTY_SUMMARY,
      buckets: [
        { level: "info", count: 120 },
        { level: "warn", count: 30 },
        { level: "error", count: 8 },
      ],
      trend: [],
      topMessages: [],
    });
    const svc = new DashboardLogsService(stub);
    const out = await svc.getOverview(QUERY);
    expect(out.levelBuckets).toEqual([
      { level: "info", count: 120 },
      { level: "warn", count: 30 },
      { level: "error", count: 8 },
    ]);
  });
});

describe("DashboardLogsService / trend 三折线", () => {
  it("透传 info/warn/error 三字段", async () => {
    const stub = createStubService({
      summaryCurrent: EMPTY_SUMMARY,
      summaryPrevious: EMPTY_SUMMARY,
      buckets: ZERO_BUCKETS,
      trend: [
        {
          hour: "2026-04-29T10:00:00.000Z",
          info: 20,
          warn: 5,
          error: 1,
        },
        {
          hour: "2026-04-29T11:00:00.000Z",
          info: 0,
          warn: 0,
          error: 0,
        },
      ],
      topMessages: [],
    });
    const svc = new DashboardLogsService(stub);
    const out = await svc.getOverview(QUERY);
    expect(out.trend).toEqual([
      { hour: "2026-04-29T10:00:00.000Z", info: 20, warn: 5, error: 1 },
      { hour: "2026-04-29T11:00:00.000Z", info: 0, warn: 0, error: 0 },
    ]);
  });
});

describe("DashboardLogsService / topMessages 透传", () => {
  it("保持顺序，level / messageHead / count / lastSeenMs 完整", async () => {
    const stub = createStubService({
      summaryCurrent: EMPTY_SUMMARY,
      summaryPrevious: EMPTY_SUMMARY,
      buckets: ZERO_BUCKETS,
      trend: [],
      topMessages: [
        {
          level: "error",
          messageHead: "TypeError: Cannot read props",
          count: 30,
          lastSeenMs: 1_700_000_003_000_000,
        },
        {
          level: "warn",
          messageHead: "Slow request detected",
          count: 10,
          lastSeenMs: 1_700_000_002_000_000,
        },
      ],
    });
    const svc = new DashboardLogsService(stub);
    const out = await svc.getOverview(QUERY);
    expect(out.topMessages).toEqual([
      {
        level: "error",
        messageHead: "TypeError: Cannot read props",
        count: 30,
        lastSeenMs: 1_700_000_003_000_000,
      },
      {
        level: "warn",
        messageHead: "Slow request detected",
        count: 10,
        lastSeenMs: 1_700_000_002_000_000,
      },
    ]);
  });
});

describe("DashboardLogsService / 边界", () => {
  it("current=0 previous>0 → totalLogs flat（按相同规则）", async () => {
    const stub = createStubService({
      summaryCurrent: EMPTY_SUMMARY,
      summaryPrevious: {
        totalLogs: 100,
        errorCount: 10,
        warnCount: 20,
        infoCount: 70,
        errorRatio: 0.1,
      },
      buckets: ZERO_BUCKETS,
      trend: [],
      topMessages: [],
    });
    const svc = new DashboardLogsService(stub);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.delta.totalLogsDirection).toBe("flat");
  });

  it("errorRatio 相同 → flat", async () => {
    const stub = createStubService({
      summaryCurrent: {
        totalLogs: 100,
        errorCount: 10,
        warnCount: 20,
        infoCount: 70,
        errorRatio: 0.1,
      },
      summaryPrevious: {
        totalLogs: 100,
        errorCount: 10,
        warnCount: 20,
        infoCount: 70,
        errorRatio: 0.1,
      },
      buckets: ZERO_BUCKETS,
      trend: [],
      topMessages: [],
    });
    const svc = new DashboardLogsService(stub);
    const out = await svc.getOverview(QUERY);
    expect(out.summary.delta.errorRatioDirection).toBe("flat");
    expect(out.summary.delta.errorRatio).toBe(0);
  });
});
