import { describe, it, expect, vi } from "vitest";
import type { CustomMetric } from "@g-heal-claw/shared";
import { CustomMetricsService } from "../../../src/modules/custom/custom-metrics.service.js";
import type { DatabaseService } from "../../../src/shared/database/database.service.js";

/**
 * CustomMetricsService 单测（ADR-0023 §4 / TM.1.C.3）
 *
 * 覆盖：db=null 短路 / summary 全局分位数 null 归零 / topMetrics per-name p50p75p95 / trend Date+ISO 归一
 */

interface ExecuteStub {
  (sql: unknown): Promise<readonly Record<string, unknown>[]>;
}

function createStubDb(queue: readonly Record<string, unknown>[][]): {
  readonly service: DatabaseService;
  readonly executeSpy: ReturnType<typeof vi.fn>;
} {
  let idx = 0;
  const executeSpy = vi.fn<ExecuteStub>(async () => {
    const rows = queue[idx] ?? [];
    idx += 1;
    return rows;
  });
  const db = { execute: executeSpy } as unknown as NonNullable<
    DatabaseService["db"]
  >;
  const service = { db } as unknown as DatabaseService;
  return { service, executeSpy };
}

const WINDOW = {
  projectId: "proj_test",
  sinceMs: 1_700_000_000_000,
  untilMs: 1_700_000_003_600_000,
};

describe("CustomMetricsService / db=null 短路", () => {
  const nullDb = { db: null } as unknown as DatabaseService;

  it("saveBatch 空数组返回 0", async () => {
    const svc = new CustomMetricsService(nullDb);
    expect(await svc.saveBatch([])).toBe(0);
  });

  it("saveBatch db=null 返回 0", async () => {
    const svc = new CustomMetricsService(nullDb);
    expect(await svc.saveBatch([buildCustomMetric()])).toBe(0);
  });

  it("countForProject db=null 返回 0", async () => {
    const svc = new CustomMetricsService(nullDb);
    expect(await svc.countForProject("p")).toBe(0);
  });

  it("aggregateSummary db=null 返回零填充", async () => {
    const svc = new CustomMetricsService(nullDb);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalSamples: 0,
      distinctNames: 0,
      globalP75: 0,
      globalP95: 0,
    });
  });

  it("aggregateTopMetrics / aggregateTrend db=null 返回空数组", async () => {
    const svc = new CustomMetricsService(nullDb);
    expect(await svc.aggregateTopMetrics(WINDOW, 10)).toEqual([]);
    expect(await svc.aggregateTrend(WINDOW)).toEqual([]);
  });
});

describe("CustomMetricsService / aggregateSummary", () => {
  it("字符串数值强转 + 分位数正常", async () => {
    const { service } = createStubDb([
      [{ total: "1000", names: "12", p75: "350", p95: "980" }],
    ]);
    const svc = new CustomMetricsService(service);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalSamples: 1000,
      distinctNames: 12,
      globalP75: 350,
      globalP95: 980,
    });
  });

  it("分位数 null → 归零", async () => {
    const { service } = createStubDb([
      [{ total: "0", names: "0", p75: null, p95: null }],
    ]);
    const svc = new CustomMetricsService(service);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalSamples: 0,
      distinctNames: 0,
      globalP75: 0,
      globalP95: 0,
    });
  });

  it("空结果集 → 零填充", async () => {
    const { service } = createStubDb([[]]);
    const svc = new CustomMetricsService(service);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalSamples: 0,
      distinctNames: 0,
      globalP75: 0,
      globalP95: 0,
    });
  });
});

describe("CustomMetricsService / aggregateTopMetrics", () => {
  it("per-name p50p75p95 + avg 字符串强转；null → 0", async () => {
    const { service, executeSpy } = createStubDb([
      [
        {
          name: "loadCheckout",
          n: "120",
          p50: "200",
          p75: "350",
          p95: "900",
          avg: "260",
        },
        {
          name: "loadProduct",
          n: "80",
          p50: "150",
          p75: null,
          p95: null,
          avg: null,
        },
      ],
    ]);
    const svc = new CustomMetricsService(service);
    const out = await svc.aggregateTopMetrics(WINDOW, 999);
    expect(executeSpy).toHaveBeenCalledOnce();
    expect(out).toEqual([
      {
        name: "loadCheckout",
        count: 120,
        p50: 200,
        p75: 350,
        p95: 900,
        avgDurationMs: 260,
      },
      {
        name: "loadProduct",
        count: 80,
        p50: 150,
        p75: 0,
        p95: 0,
        avgDurationMs: 0,
      },
    ]);
  });
});

describe("CustomMetricsService / aggregateTrend", () => {
  it("Date / ISO 字符串双路归一 + avg null → 0", async () => {
    const { service } = createStubDb([
      [
        { hour: new Date("2026-04-29T10:00:00.000Z"), n: "30", avg: "220" },
        { hour: "2026-04-29T11:00:00.000Z", n: 0, avg: null },
      ],
    ]);
    const svc = new CustomMetricsService(service);
    expect(await svc.aggregateTrend(WINDOW)).toEqual([
      {
        hour: "2026-04-29T10:00:00.000Z",
        count: 30,
        avgDurationMs: 220,
      },
      {
        hour: "2026-04-29T11:00:00.000Z",
        count: 0,
        avgDurationMs: 0,
      },
    ]);
  });
});

/** CustomMetric fixture（最小合法字段） */
function buildCustomMetric(
  overrides: Partial<CustomMetric> = {},
): CustomMetric {
  return {
    type: "custom_metric",
    eventId: "22222222-3333-4444-8555-666666666666",
    projectId: "proj_test",
    publicKey: "pk_demo",
    sessionId: "sess_1",
    timestamp: 1_700_000_000_000,
    name: "loadCheckout",
    duration: 320,
    page: {
      url: "https://app.example.com/",
      path: "/",
    },
    device: {
      ua: "test",
      os: "macOS",
      browser: "Chrome",
      deviceType: "desktop",
      screen: { width: 1920, height: 1080, dpr: 2 },
      language: "en-US",
      timezone: "UTC",
    },
    environment: "test",
    ...overrides,
  };
}
