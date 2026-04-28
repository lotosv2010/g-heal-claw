import { describe, expect, it, vi } from "vitest";
import type {
  DimensionAggregateRow,
  FmpPageAggregateRow,
  LongTaskSummaryRow,
  NavigationTrendRow,
  PerformanceService,
  SlowPageAggregateRow,
  TrendAggregateRow,
  VitalAggregateRow,
} from "../performance/performance.service.js";
import { DashboardPerformanceService } from "./performance.service.js";

/**
 * DashboardPerformanceService 装配层单元测试（ADR-0018 P1.2）
 *
 * 策略：mock PerformanceService 的 7 个聚合查询，仅校验 DTO 装配逻辑：
 *  - vitals：10 项按 VITAL_ORDER 排序 + tone 映射 + 环比计算
 *  - trend：长表 → 宽表合并；Navigation 子字段从 navTrend 合并；SI 在白名单里
 *  - stages：9 阶段瀑布（7 serial + firstScreen + lcp）；空样本降级空数组
 *  - slowPages / fmpPages / dimensions：原样映射 + within3sRatio 保留 4 位
 *  - longTasks：tiers 3 级分布映射
 */

// -------- Fixtures --------

function emptyVitals(): VitalAggregateRow[] {
  return [];
}
function emptyLongTasks(): LongTaskSummaryRow {
  return {
    count: 0,
    totalMs: 0,
    p75Ms: 0,
    tiers: { longTask: 0, jank: 0, unresponsive: 0 },
  };
}

function buildPerfMock(overrides: {
  vitalsCurrent?: VitalAggregateRow[];
  vitalsPrevious?: VitalAggregateRow[];
  trend?: TrendAggregateRow[];
  navTrend?: NavigationTrendRow[];
  waterfallSamples?: Awaited<
    ReturnType<PerformanceService["aggregateWaterfallSamples"]>
  >;
  slowPages?: SlowPageAggregateRow[];
  fmpPages?: FmpPageAggregateRow[];
  browser?: DimensionAggregateRow[];
  os?: DimensionAggregateRow[];
  platform?: DimensionAggregateRow[];
  longTasks?: LongTaskSummaryRow;
}): PerformanceService {
  const {
    vitalsCurrent = emptyVitals(),
    vitalsPrevious = emptyVitals(),
    trend = [],
    navTrend = [],
    waterfallSamples = [],
    slowPages = [],
    fmpPages = [],
    browser = [],
    os = [],
    platform = [],
    longTasks = emptyLongTasks(),
  } = overrides;

  return {
    aggregateVitals: vi
      .fn<PerformanceService["aggregateVitals"]>()
      .mockResolvedValueOnce(vitalsCurrent)
      .mockResolvedValueOnce(vitalsPrevious),
    aggregateTrend: vi
      .fn<PerformanceService["aggregateTrend"]>()
      .mockResolvedValue(trend),
    aggregateNavigationTrend: vi
      .fn<PerformanceService["aggregateNavigationTrend"]>()
      .mockResolvedValue(navTrend),
    aggregateWaterfallSamples: vi
      .fn<PerformanceService["aggregateWaterfallSamples"]>()
      .mockResolvedValue(waterfallSamples),
    aggregateSlowPages: vi
      .fn<PerformanceService["aggregateSlowPages"]>()
      .mockResolvedValue(slowPages),
    aggregateFmpPages: vi
      .fn<PerformanceService["aggregateFmpPages"]>()
      .mockResolvedValue(fmpPages),
    aggregateDimension: vi
      .fn<PerformanceService["aggregateDimension"]>()
      .mockImplementation(async (_p, field) => {
        if (field === "browser") return browser;
        if (field === "os") return os;
        return platform;
      }),
    aggregateLongTasks: vi
      .fn<PerformanceService["aggregateLongTasks"]>()
      .mockResolvedValue(longTasks),
  } as unknown as PerformanceService;
}

describe("DashboardPerformanceService.getOverview — 空态", () => {
  it("全部聚合返回空 → DTO 的 9 个 vitals 缺失填 0 + 各列表为空 + longTasks.tiers 全 0", async () => {
    const svc = new DashboardPerformanceService(buildPerfMock({}));
    const dto = await svc.getOverview({
      projectId: "demo",
      windowHours: 24,
      limitSlowPages: 10,
    });
    // VITAL_ORDER 固定 9 项
    expect(dto.vitals.map((v) => v.key)).toEqual([
      "LCP",
      "INP",
      "CLS",
      "TTFB",
      "FCP",
      "TTI",
      "TBT",
      "FID",
      "SI",
    ]);
    expect(dto.vitals.every((v) => v.value === 0 && v.sampleCount === 0)).toBe(
      true,
    );
    expect(dto.trend).toEqual([]);
    expect(dto.stages).toEqual([]);
    expect(dto.slowPages).toEqual([]);
    expect(dto.fmpPages).toEqual([]);
    expect(dto.dimensions).toEqual({ browser: [], os: [], platform: [] });
    expect(dto.longTasks).toEqual({
      count: 0,
      totalMs: 0,
      p75Ms: 0,
      tiers: { longTask: 0, jank: 0, unresponsive: 0 },
    });
  });
});

describe("DashboardPerformanceService.getOverview — vitals 装配", () => {
  it("LCP 值和环比按 previous 比较计算 deltaPercent/direction", async () => {
    const svc = new DashboardPerformanceService(
      buildPerfMock({
        vitalsCurrent: [{ metric: "LCP", p75: 2500, sampleCount: 100 }],
        vitalsPrevious: [{ metric: "LCP", p75: 2000, sampleCount: 80 }],
      }),
    );
    const dto = await svc.getOverview({
      projectId: "demo",
      windowHours: 24,
      limitSlowPages: 10,
    });
    const lcp = dto.vitals.find((v) => v.key === "LCP");
    expect(lcp).toMatchObject({
      key: "LCP",
      value: 2500,
      unit: "ms",
      tone: "good", // 恰在阈值 [2500,4000] 的下界
      sampleCount: 100,
      deltaDirection: "up",
      deltaPercent: 25,
    });
  });

  it("tone 映射：阈值外为 destructive，阈值中间为 warn", async () => {
    const svc = new DashboardPerformanceService(
      buildPerfMock({
        vitalsCurrent: [
          { metric: "LCP", p75: 5000, sampleCount: 10 }, // > 4000 → destructive
          { metric: "FCP", p75: 2000, sampleCount: 10 }, // 1800~3000 → warn
        ],
      }),
    );
    const dto = await svc.getOverview({
      projectId: "demo",
      windowHours: 24,
      limitSlowPages: 10,
    });
    expect(dto.vitals.find((v) => v.key === "LCP")?.tone).toBe("destructive");
    expect(dto.vitals.find((v) => v.key === "FCP")?.tone).toBe("warn");
  });

  it("CLS 保留 3 位小数（2 位会把 0.003 吞成 0）", async () => {
    const svc = new DashboardPerformanceService(
      buildPerfMock({
        vitalsCurrent: [{ metric: "CLS", p75: 0.0034, sampleCount: 10 }],
      }),
    );
    const dto = await svc.getOverview({
      projectId: "demo",
      windowHours: 24,
      limitSlowPages: 10,
    });
    expect(dto.vitals.find((v) => v.key === "CLS")?.value).toBe(0.003);
    expect(dto.vitals.find((v) => v.key === "CLS")?.unit).toBe("");
  });
});

describe("DashboardPerformanceService.getOverview — trend 宽表合并", () => {
  it("同一小时内 SI 与 Navigation 子字段被合并到一个桶", async () => {
    const hour = "2026-04-28T10:00:00.000Z";
    const svc = new DashboardPerformanceService(
      buildPerfMock({
        trend: [
          { hour, metric: "LCP", p75: 2100 },
          { hour, metric: "SI", p75: 3500 },
          { hour, metric: "FSP", p75: 1500 },
        ],
        navTrend: [
          {
            hour,
            dnsP75: 10,
            tcpP75: 20,
            sslP75: 30,
            responseP75: 100,
            domParseP75: 200,
            resourceLoadP75: 300,
            sampleCount: 42,
          },
        ],
      }),
    );
    const dto = await svc.getOverview({
      projectId: "demo",
      windowHours: 24,
      limitSlowPages: 10,
    });
    expect(dto.trend).toHaveLength(1);
    const bucket = dto.trend[0];
    expect(bucket).toMatchObject({
      hour,
      lcpP75: 2100,
      siP75: 3500,
      fmpP75: 1500,
      dnsP75: 10,
      tcpP75: 20,
      sslP75: 30,
      contentDownloadP75: 100,
      domParseP75: 200,
      resourceLoadP75: 300,
      sampleCount: 42,
    });
  });

  it("多个小时按升序返回", async () => {
    const h1 = "2026-04-28T09:00:00.000Z";
    const h2 = "2026-04-28T10:00:00.000Z";
    const svc = new DashboardPerformanceService(
      buildPerfMock({
        trend: [
          { hour: h2, metric: "LCP", p75: 2000 },
          { hour: h1, metric: "LCP", p75: 1800 },
        ],
      }),
    );
    const dto = await svc.getOverview({
      projectId: "demo",
      windowHours: 24,
      limitSlowPages: 10,
    });
    expect(dto.trend.map((b) => b.hour)).toEqual([h1, h2]);
  });
});

describe("DashboardPerformanceService.getOverview — stages 瀑布", () => {
  it("有样本 + firstScreen/lcp 时生成 9 阶段（7 serial + firstScreen + lcp）", async () => {
    const svc = new DashboardPerformanceService(
      buildPerfMock({
        waterfallSamples: [
          {
            dns: 10,
            tcp: 20,
            ssl: 30,
            request: 40,
            response: 100,
            domParse: 200,
            resourceLoad: 300,
            total: 700,
            type: "navigate",
          },
        ],
        vitalsCurrent: [
          { metric: "FCP", p75: 800, sampleCount: 10 },
          { metric: "LCP", p75: 1800, sampleCount: 10 },
        ],
      }),
    );
    const dto = await svc.getOverview({
      projectId: "demo",
      windowHours: 24,
      limitSlowPages: 10,
    });
    expect(dto.stages.map((s) => s.key)).toEqual([
      "dns",
      "tcp",
      "ssl",
      "request",
      "response",
      "domParse",
      "resourceLoad",
      "firstScreen",
      "lcp",
    ]);
    // serial 阶段 cursor 累积
    expect(dto.stages[0]).toMatchObject({ startMs: 0, endMs: 10, ms: 10 });
    expect(dto.stages[1]).toMatchObject({ startMs: 10, endMs: 30 });
    // firstScreen / lcp 从 0 起
    const fs = dto.stages.find((s) => s.key === "firstScreen");
    const lcp = dto.stages.find((s) => s.key === "lcp");
    expect(fs).toMatchObject({ startMs: 0, endMs: 800 });
    expect(lcp).toMatchObject({ startMs: 0, endMs: 1800 });
  });
});

describe("DashboardPerformanceService.getOverview — fmpPages / dimensions / longTasks", () => {
  it("fmpPages 原样映射 + within3sRatio 保留 4 位", async () => {
    const svc = new DashboardPerformanceService(
      buildPerfMock({
        fmpPages: [
          {
            path: "/home",
            sampleCount: 100,
            fmpAvgMs: 1500.7,
            fullyLoadedAvgMs: 2400.3,
            within3sRatio: 0.956789,
          },
        ],
      }),
    );
    const dto = await svc.getOverview({
      projectId: "demo",
      windowHours: 24,
      limitSlowPages: 10,
    });
    expect(dto.fmpPages[0]).toEqual({
      url: "/home",
      sampleCount: 100,
      fmpAvgMs: 1501,
      fullyLoadedAvgMs: 2400,
      within3sRatio: 0.9568,
    });
  });

  it("dimensions 按 sampleCount 占比计算 sharePercent（保留 2 位小数）", async () => {
    const svc = new DashboardPerformanceService(
      buildPerfMock({
        browser: [
          { value: "Chrome", sampleCount: 75, fmpAvgMs: 1200 },
          { value: "Safari", sampleCount: 25, fmpAvgMs: 1500 },
        ],
      }),
    );
    const dto = await svc.getOverview({
      projectId: "demo",
      windowHours: 24,
      limitSlowPages: 10,
    });
    expect(dto.dimensions.browser).toEqual([
      {
        value: "Chrome",
        sampleCount: 75,
        sharePercent: 75,
        fmpAvgMs: 1200,
      },
      {
        value: "Safari",
        sampleCount: 25,
        sharePercent: 25,
        fmpAvgMs: 1500,
      },
    ]);
  });

  it("longTasks.tiers 三级分布按聚合行透传", async () => {
    const svc = new DashboardPerformanceService(
      buildPerfMock({
        longTasks: {
          count: 30,
          totalMs: 4500,
          p75Ms: 180,
          tiers: { longTask: 20, jank: 7, unresponsive: 3 },
        },
      }),
    );
    const dto = await svc.getOverview({
      projectId: "demo",
      windowHours: 24,
      limitSlowPages: 10,
    });
    expect(dto.longTasks).toEqual({
      count: 30,
      totalMs: 4500,
      p75Ms: 180,
      tiers: { longTask: 20, jank: 7, unresponsive: 3 },
    });
  });
});
