import { describe, expect, it, vi } from "vitest";
import type {
  ErrorsService,
  ErrorSummaryRow,
  SubTypeCountRow,
  TopGroupRow,
  TrendRow,
} from "../errors/errors.service.js";
import { DashboardErrorsService } from "./errors.service.js";

/**
 * DashboardErrorsService 装配层单元测试（ADR-0016 §3）
 *
 * 策略：mock ErrorsService 返回 Row，只校验映射/环比/占位补齐逻辑。
 */

function buildMockErrorsService(rows: {
  current: ErrorSummaryRow;
  previous: ErrorSummaryRow;
  bySubType: SubTypeCountRow[];
  trend: TrendRow[];
  topGroups: TopGroupRow[];
}): ErrorsService {
  return {
    aggregateSummary: vi
      .fn<ErrorsService["aggregateSummary"]>()
      .mockResolvedValueOnce(rows.current)
      .mockResolvedValueOnce(rows.previous),
    aggregateBySubType: vi
      .fn<ErrorsService["aggregateBySubType"]>()
      .mockResolvedValue(rows.bySubType),
    aggregateTrend: vi
      .fn<ErrorsService["aggregateTrend"]>()
      .mockResolvedValue(rows.trend),
    aggregateTopGroups: vi
      .fn<ErrorsService["aggregateTopGroups"]>()
      .mockResolvedValue(rows.topGroups),
  } as unknown as ErrorsService;
}

describe("DashboardErrorsService.getOverview", () => {
  it("空数据：summary=0 + bySubType 补齐 5 占位 + trend/topGroups 空数组", async () => {
    const errors = buildMockErrorsService({
      current: { totalEvents: 0, impactedSessions: 0 },
      previous: { totalEvents: 0, impactedSessions: 0 },
      bySubType: [],
      trend: [],
      topGroups: [],
    });
    const svc = new DashboardErrorsService(errors);
    const dto = await svc.getOverview({
      projectId: "demo",
      windowHours: 24,
      limitGroups: 10,
    });
    expect(dto.summary).toEqual({
      totalEvents: 0,
      impactedSessions: 0,
      deltaPercent: 0,
      deltaDirection: "flat",
    });
    expect(dto.bySubType).toHaveLength(5);
    expect(dto.bySubType.map((r) => r.subType)).toEqual([
      "js",
      "promise",
      "resource",
      "framework",
      "white_screen",
    ]);
    expect(dto.bySubType.every((r) => r.count === 0 && r.ratio === 0)).toBe(
      true,
    );
    expect(dto.trend).toEqual([]);
    expect(dto.topGroups).toEqual([]);
  });

  it("单 subType：只有 js 命中时 ratio=1，其余占位 ratio=0", async () => {
    const errors = buildMockErrorsService({
      current: { totalEvents: 10, impactedSessions: 4 },
      previous: { totalEvents: 8, impactedSessions: 3 },
      bySubType: [{ subType: "js", count: 10 }],
      trend: [],
      topGroups: [],
    });
    const dto = await new DashboardErrorsService(errors).getOverview({
      projectId: "demo",
      windowHours: 24,
      limitGroups: 10,
    });
    expect(dto.summary.totalEvents).toBe(10);
    expect(dto.summary.impactedSessions).toBe(4);
    const js = dto.bySubType.find((r) => r.subType === "js");
    expect(js?.count).toBe(10);
    expect(js?.ratio).toBe(1);
    // 其余 4 占位
    expect(
      dto.bySubType.filter((r) => r.subType !== "js").every((r) => r.count === 0),
    ).toBe(true);
  });

  it("环比上升 25%：deltaPercent=25 / deltaDirection='up'", async () => {
    const errors = buildMockErrorsService({
      current: { totalEvents: 100, impactedSessions: 40 },
      previous: { totalEvents: 80, impactedSessions: 30 },
      bySubType: [],
      trend: [],
      topGroups: [],
    });
    const dto = await new DashboardErrorsService(errors).getOverview({
      projectId: "demo",
      windowHours: 24,
      limitGroups: 10,
    });
    expect(dto.summary.deltaPercent).toBe(25);
    expect(dto.summary.deltaDirection).toBe("up");
  });

  it("环比下降 20%：deltaPercent=20 / deltaDirection='down'", async () => {
    const errors = buildMockErrorsService({
      current: { totalEvents: 80, impactedSessions: 30 },
      previous: { totalEvents: 100, impactedSessions: 40 },
      bySubType: [],
      trend: [],
      topGroups: [],
    });
    const dto = await new DashboardErrorsService(errors).getOverview({
      projectId: "demo",
      windowHours: 24,
      limitGroups: 10,
    });
    expect(dto.summary.deltaPercent).toBe(20);
    expect(dto.summary.deltaDirection).toBe("down");
  });

  it("topGroups：ms 时间戳映射为 ISO 字符串 + subType 原样保留 + samplePath → sampleUrl", async () => {
    const firstMs = Date.UTC(2026, 3, 27, 3, 10, 12);
    const lastMs = Date.UTC(2026, 3, 27, 9, 41, 32);
    const errors = buildMockErrorsService({
      current: { totalEvents: 54, impactedSessions: 21 },
      previous: { totalEvents: 0, impactedSessions: 0 },
      bySubType: [{ subType: "js", count: 54 }],
      trend: [
        { hour: "2026-04-27T00:00:00.000Z", subType: "js", count: 40 },
        { hour: "2026-04-27T00:00:00.000Z", subType: "promise", count: 5 },
        { hour: "2026-04-27T01:00:00.000Z", subType: "resource", count: 9 },
      ],
      topGroups: [
        {
          subType: "js",
          messageHead: "Cannot read properties of undefined (reading 'x')",
          count: 54,
          impactedSessions: 21,
          firstSeenMs: firstMs,
          lastSeenMs: lastMs,
          samplePath: "/profile",
        },
      ],
    });
    const dto = await new DashboardErrorsService(errors).getOverview({
      projectId: "demo",
      windowHours: 24,
      limitGroups: 10,
    });
    expect(dto.topGroups).toHaveLength(1);
    const g = dto.topGroups[0]!;
    expect(g.subType).toBe("js");
    expect(g.messageHead).toContain("Cannot read properties");
    expect(g.count).toBe(54);
    expect(g.impactedSessions).toBe(21);
    expect(g.firstSeen).toBe(new Date(firstMs).toISOString());
    expect(g.lastSeen).toBe(new Date(lastMs).toISOString());
    expect(g.sampleUrl).toBe("/profile");

    // trend 聚成宽表：hour=00 含 js=40 promise=5 total=45
    const hour0 = dto.trend.find((t) => t.hour === "2026-04-27T00:00:00.000Z");
    expect(hour0).toEqual({
      hour: "2026-04-27T00:00:00.000Z",
      total: 45,
      js: 40,
      promise: 5,
      resource: 0,
      framework: 0,
      whiteScreen: 0,
    });
    // hour=01：resource=9 total=9
    const hour1 = dto.trend.find((t) => t.hour === "2026-04-27T01:00:00.000Z");
    expect(hour1?.total).toBe(9);
    expect(hour1?.resource).toBe(9);
  });
});
