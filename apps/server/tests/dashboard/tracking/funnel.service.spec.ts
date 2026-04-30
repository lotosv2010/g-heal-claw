import { describe, it, expect, vi } from "vitest";
import { DashboardFunnelService } from "../../../src/dashboard/tracking/funnel.service.js";
import type {
  FunnelParams,
  FunnelStepRow,
  TrackingService,
} from "../../../src/modules/tracking/tracking.service.js";

/**
 * DashboardFunnelService 装配层单测（ADR-0027 / TM.2.D.2）
 *
 * 覆盖：
 *  - 正常三步：conversionFromPrev / conversionFromFirst / overallConversion 计算
 *  - 末步 0：保留全部步长，比例为 0
 *  - 首步 0（空窗口）：全部比例返回 0，不除零
 *  - 舍入边界：4 位小数截断
 *
 * TrackingService 以 mock 注入；仅关心装配层比例计算逻辑。
 */

function createStubTracking(rows: readonly FunnelStepRow[]): {
  readonly tracking: TrackingService;
  readonly captured: FunnelParams[];
} {
  const captured: FunnelParams[] = [];
  const mock = {
    aggregateFunnel: vi.fn(async (params: FunnelParams) => {
      captured.push(params);
      return rows;
    }),
  };
  return {
    tracking: mock as unknown as TrackingService,
    captured,
  };
}

const BASE_QUERY = {
  projectId: "proj_test",
  windowHours: 24,
  stepWindowMinutes: 60,
  steps: ["view_home", "click_cta", "submit_form"],
};

describe("DashboardFunnelService / 正常三步", () => {
  it("计算 conversionFromPrev / conversionFromFirst / overallConversion", async () => {
    const { tracking, captured } = createStubTracking([
      { index: 1, eventName: "view_home", users: 1000 },
      { index: 2, eventName: "click_cta", users: 370 },
      { index: 3, eventName: "submit_form", users: 97 },
    ]);
    const svc = new DashboardFunnelService(tracking);
    const out = await svc.getOverview(BASE_QUERY);

    expect(out.totalEntered).toBe(1000);
    expect(out.windowHours).toBe(24);
    expect(out.stepWindowMinutes).toBe(60);
    expect(out.steps).toHaveLength(3);
    expect(out.steps[0]).toEqual({
      index: 1,
      eventName: "view_home",
      users: 1000,
      conversionFromPrev: 1,
      conversionFromFirst: 1,
    });
    expect(out.steps[1]).toEqual({
      index: 2,
      eventName: "click_cta",
      users: 370,
      conversionFromPrev: 0.37,
      conversionFromFirst: 0.37,
    });
    expect(out.steps[2]).toEqual({
      index: 3,
      eventName: "submit_form",
      users: 97,
      conversionFromPrev: 0.2622,
      conversionFromFirst: 0.097,
    });
    expect(out.overallConversion).toBe(0.097);

    // 单位换算校验：60 min → 3_600_000 ms
    expect(captured).toHaveLength(1);
    expect(captured[0]!.stepWindowMs).toBe(3_600_000);
    expect(captured[0]!.steps).toEqual([
      "view_home",
      "click_cta",
      "submit_form",
    ]);
  });
});

describe("DashboardFunnelService / 末步 0 不短路", () => {
  it("最后一步 users=0 时步长保留，比例为 0", async () => {
    const { tracking } = createStubTracking([
      { index: 1, eventName: "a", users: 500 },
      { index: 2, eventName: "b", users: 200 },
      { index: 3, eventName: "c", users: 0 },
    ]);
    const svc = new DashboardFunnelService(tracking);
    const out = await svc.getOverview({ ...BASE_QUERY, steps: ["a", "b", "c"] });

    expect(out.totalEntered).toBe(500);
    expect(out.steps).toHaveLength(3);
    expect(out.steps[2]).toEqual({
      index: 3,
      eventName: "c",
      users: 0,
      conversionFromPrev: 0,
      conversionFromFirst: 0,
    });
    expect(out.overallConversion).toBe(0);
  });
});

describe("DashboardFunnelService / 首步 0（空窗口）", () => {
  it("totalEntered=0 时全部比例为 0，overallConversion=0", async () => {
    const { tracking } = createStubTracking([
      { index: 1, eventName: "a", users: 0 },
      { index: 2, eventName: "b", users: 0 },
    ]);
    const svc = new DashboardFunnelService(tracking);
    const out = await svc.getOverview({ ...BASE_QUERY, steps: ["a", "b"] });

    expect(out.totalEntered).toBe(0);
    expect(out.steps[0]!.conversionFromPrev).toBe(0);
    expect(out.steps[0]!.conversionFromFirst).toBe(0);
    expect(out.steps[1]!.conversionFromPrev).toBe(0);
    expect(out.steps[1]!.conversionFromFirst).toBe(0);
    expect(out.overallConversion).toBe(0);
  });
});

describe("DashboardFunnelService / 舍入边界", () => {
  it("截断到 4 位小数", async () => {
    const { tracking } = createStubTracking([
      { index: 1, eventName: "a", users: 3 },
      { index: 2, eventName: "b", users: 1 },
    ]);
    const svc = new DashboardFunnelService(tracking);
    const out = await svc.getOverview({ ...BASE_QUERY, steps: ["a", "b"] });

    // 1/3 = 0.33333... → 0.3333
    expect(out.steps[1]!.conversionFromPrev).toBe(0.3333);
    expect(out.steps[1]!.conversionFromFirst).toBe(0.3333);
    expect(out.overallConversion).toBe(0.3333);
  });
});
