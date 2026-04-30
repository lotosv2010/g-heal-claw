import { describe, it, expect, vi } from "vitest";
import { DashboardRetentionService } from "../../../src/dashboard/tracking/retention.service.js";
import type {
  VisitsService,
  RetentionMatrixRow,
} from "../../../src/modules/visits/visits.service.js";
import type { RetentionOverviewQuery } from "../../../src/dashboard/dto/tracking-retention.dto.js";

/**
 * DashboardRetentionService 装配层单测（ADR-0028 / TM.2.E.2）
 *
 * 4 case：
 *  1. 空 rows → source=empty + totalNewUsers=0 + averageByDay 全 0
 *  2. 正常矩阵 → retentionByDay / averageByDay 加权正确（含 day 0 恒 1 断言）
 *  3. averageByDay 加权：cohort A size=10 day1=5，cohort B size=30 day1=3
 *     → avg day1 = (5 + 3) / (10 + 30) = 0.2（而非简单平均 0.45）
 *  4. aggregateRetention 抛错 → source=error + 结构完整（不 5xx）
 */

function createVisits(
  rows: readonly RetentionMatrixRow[] | Error,
): VisitsService {
  const fn = vi.fn(async () => {
    if (rows instanceof Error) throw rows;
    return rows;
  });
  return { aggregateRetention: fn } as unknown as VisitsService;
}

const baseQuery: RetentionOverviewQuery = {
  projectId: "proj_test",
  cohortDays: 7,
  returnDays: 7,
  identity: "session",
  since: undefined,
  until: undefined,
};

describe("DashboardRetentionService.getOverview / 空 rows", () => {
  it("rows=[] → source=empty，totalNewUsers=0，averageByDay 全 0 且长度 = returnDays+1", async () => {
    const svc = new DashboardRetentionService(createVisits([]));
    const out = await svc.getOverview({ ...baseQuery });
    expect(out.source).toBe("empty");
    expect(out.totalNewUsers).toBe(0);
    expect(out.cohorts).toEqual([]);
    expect(out.averageByDay).toHaveLength(8); // returnDays=7 → 0..7 共 8
    expect(out.averageByDay.every((x) => x === 0)).toBe(true);
    expect(out.identity).toBe("session");
  });
});

describe("DashboardRetentionService.getOverview / 正常矩阵", () => {
  it("retentionByDay day 0 恒为 1；缺失 offset 自动填 0", async () => {
    const rows: RetentionMatrixRow[] = [
      {
        cohortDay: "2026-04-16",
        cohortSize: 10,
        dayOffset: 0,
        retained: 10,
      },
      {
        cohortDay: "2026-04-16",
        cohortSize: 10,
        dayOffset: 1,
        retained: 4,
      },
      {
        cohortDay: "2026-04-16",
        cohortSize: 10,
        dayOffset: 3,
        retained: 2,
      },
    ];
    const svc = new DashboardRetentionService(createVisits(rows));
    const out = await svc.getOverview({
      ...baseQuery,
      returnDays: 3,
    });
    expect(out.source).toBe("live");
    expect(out.cohorts).toHaveLength(1);
    expect(out.cohorts[0]?.cohortDate).toBe("2026-04-16");
    expect(out.cohorts[0]?.cohortSize).toBe(10);
    // day 0/1/2/3 → [10/10, 4/10, 0/10, 2/10]
    expect(out.cohorts[0]?.retentionByDay).toEqual([1, 0.4, 0, 0.2]);
    expect(out.totalNewUsers).toBe(10);
  });
});

describe("DashboardRetentionService.getOverview / averageByDay 加权", () => {
  it("按 cohortSize 加权：小 cohort 权重不膨胀", async () => {
    // cohort A: size=10, day1=5 (0.5) ; cohort B: size=30, day1=3 (0.1)
    // 加权：(5+3) / (10+30) = 0.2（而非简单平均 0.3）
    const rows: RetentionMatrixRow[] = [
      {
        cohortDay: "2026-04-16",
        cohortSize: 10,
        dayOffset: 0,
        retained: 10,
      },
      {
        cohortDay: "2026-04-16",
        cohortSize: 10,
        dayOffset: 1,
        retained: 5,
      },
      {
        cohortDay: "2026-04-17",
        cohortSize: 30,
        dayOffset: 0,
        retained: 30,
      },
      {
        cohortDay: "2026-04-17",
        cohortSize: 30,
        dayOffset: 1,
        retained: 3,
      },
    ];
    const svc = new DashboardRetentionService(createVisits(rows));
    const out = await svc.getOverview({
      ...baseQuery,
      returnDays: 1,
    });
    expect(out.totalNewUsers).toBe(40);
    // day 0 = (10+30)/40 = 1 ; day 1 = (5+3)/40 = 0.2
    expect(out.averageByDay).toEqual([1, 0.2]);
    // 每 cohort 细节
    expect(out.cohorts).toHaveLength(2);
    expect(out.cohorts[0]?.cohortDate).toBe("2026-04-16"); // ASC
    expect(out.cohorts[0]?.retentionByDay).toEqual([1, 0.5]);
    expect(out.cohorts[1]?.retentionByDay).toEqual([1, 0.1]);
  });
});

describe("DashboardRetentionService.getOverview / 异常兜底", () => {
  it("aggregateRetention 抛错 → source=error + 结构完整", async () => {
    const svc = new DashboardRetentionService(
      createVisits(new Error("时间窗口不足")),
    );
    const out = await svc.getOverview({ ...baseQuery });
    expect(out.source).toBe("error");
    expect(out.totalNewUsers).toBe(0);
    expect(out.cohorts).toEqual([]);
    expect(out.averageByDay).toHaveLength(8);
    expect(out.averageByDay.every((x) => x === 0)).toBe(true);
    // window 字段不为空，便于前端渲染标题
    expect(out.window.sinceMs).toBeTypeOf("number");
    expect(out.window.untilMs).toBeTypeOf("number");
  });
});
