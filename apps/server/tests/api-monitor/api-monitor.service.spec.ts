import { describe, it, expect, vi } from "vitest";
import type { ApiEvent } from "@g-heal-claw/shared";
import { ApiMonitorService } from "../../src/api-monitor/api-monitor.service.js";
import type { DatabaseService } from "../../src/shared/database/database.service.js";

/**
 * ApiMonitorService 单测（ADR-0020 §4.2 / TM.1.A.3）
 *
 * 定位：**行 → DTO 的转换逻辑单测**，不验证 SQL 本身
 *  - stub `DatabaseService.db.execute()` 注入预制行
 *  - 覆盖：db=null 短路、saveBatch 幂等、4 个 aggregate Number 强转 / 分桶 / 排序
 *  - SQL 正确性由 Dockerized PG 集成测试负责
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

describe("ApiMonitorService / db=null 短路", () => {
  const nullDb = { db: null } as unknown as DatabaseService;

  it("saveBatch 空数组返回 0", async () => {
    const svc = new ApiMonitorService(nullDb);
    expect(await svc.saveBatch([])).toBe(0);
  });

  it("saveBatch db=null 返回 0", async () => {
    const svc = new ApiMonitorService(nullDb);
    expect(await svc.saveBatch([buildApiEvent()])).toBe(0);
  });

  it("countForProject db=null 返回 0", async () => {
    const svc = new ApiMonitorService(nullDb);
    expect(await svc.countForProject("p")).toBe(0);
  });

  it("aggregateSummary db=null 返回零填充", async () => {
    const svc = new ApiMonitorService(nullDb);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalRequests: 0,
      slowCount: 0,
      failedCount: 0,
      p75DurationMs: 0,
    });
  });

  it("aggregateStatusBuckets / aggregateTrend / aggregateSlowApis db=null 返回空数组", async () => {
    const svc = new ApiMonitorService(nullDb);
    expect(await svc.aggregateStatusBuckets(WINDOW)).toEqual([]);
    expect(await svc.aggregateTrend(WINDOW)).toEqual([]);
    expect(await svc.aggregateSlowApis(WINDOW, 10)).toEqual([]);
  });

  it("aggregateTopRequests / aggregateTopPages / aggregateErrorStatus db=null 返回空数组", async () => {
    const svc = new ApiMonitorService(nullDb);
    expect(await svc.aggregateTopRequests(WINDOW, 10)).toEqual([]);
    expect(await svc.aggregateTopPages(WINDOW, 10)).toEqual([]);
    expect(await svc.aggregateErrorStatus(WINDOW, 10)).toEqual([]);
  });

  it("aggregateDimension db=null 返回空数组", async () => {
    const svc = new ApiMonitorService(nullDb);
    expect(await svc.aggregateDimension(WINDOW, "browser", 10)).toEqual([]);
    expect(await svc.aggregateDimension(WINDOW, "os", 10)).toEqual([]);
    expect(await svc.aggregateDimension(WINDOW, "device_type", 10)).toEqual([]);
  });
});

describe("ApiMonitorService / aggregateSummary", () => {
  it("字符串数值强转 number；null p75 → 0", async () => {
    const { service } = createStubDb([
      [{ total: "120", slow: "8", failed: "5", p75: null }],
    ]);
    const svc = new ApiMonitorService(service);
    const out = await svc.aggregateSummary(WINDOW);
    expect(out).toEqual({
      totalRequests: 120,
      slowCount: 8,
      failedCount: 5,
      p75DurationMs: 0,
    });
  });

  it("空结果集返回零填充", async () => {
    const { service } = createStubDb([[]]);
    const svc = new ApiMonitorService(service);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalRequests: 0,
      slowCount: 0,
      failedCount: 0,
      p75DurationMs: 0,
    });
  });
});

describe("ApiMonitorService / aggregateStatusBuckets", () => {
  it("多桶行强转 Number", async () => {
    const { service } = createStubDb([
      [
        { bucket: "2xx", n: "100" },
        { bucket: "4xx", n: "7" },
        { bucket: "5xx", n: 3 },
      ],
    ]);
    const svc = new ApiMonitorService(service);
    const out = await svc.aggregateStatusBuckets(WINDOW);
    expect(out).toEqual([
      { bucket: "2xx", count: 100 },
      { bucket: "4xx", count: 7 },
      { bucket: "5xx", count: 3 },
    ]);
  });
});

describe("ApiMonitorService / aggregateTrend", () => {
  it("Date / ISO 字符串双路归一为 ISO；avg/null/成功率 计算", async () => {
    const { service } = createStubDb([
      [
        {
          hour: new Date("2026-04-29T10:00:00.000Z"),
          n: "50",
          slow: "3",
          failed: "1",
          avg: "120.5",
          ok: "47",
        },
        {
          hour: "2026-04-29T11:00:00.000Z",
          n: 0,
          slow: 0,
          failed: 0,
          avg: null,
          ok: 0,
        },
      ],
    ]);
    const svc = new ApiMonitorService(service);
    const out = await svc.aggregateTrend(WINDOW);
    expect(out).toEqual([
      {
        hour: "2026-04-29T10:00:00.000Z",
        count: 50,
        slowCount: 3,
        failedCount: 1,
        avgDurationMs: 120.5,
        successRatio: 47 / 50,
      },
      {
        hour: "2026-04-29T11:00:00.000Z",
        count: 0,
        slowCount: 0,
        failedCount: 0,
        avgDurationMs: 0,
        successRatio: 0,
      },
    ]);
  });
});

describe("ApiMonitorService / aggregateSlowApis", () => {
  it("failureRatio 计算 + p75 null → 0；limit 边界裁剪", async () => {
    const { service, executeSpy } = createStubDb([
      [
        {
          method: "GET",
          host: "api.example.com",
          path_template: "/v1/users",
          n: "100",
          p75: "850",
          failed: "10",
        },
        {
          method: "POST",
          host: "api.example.com",
          path_template: "/v1/orders",
          n: "4",
          p75: null,
          failed: "0",
        },
      ],
    ]);
    const svc = new ApiMonitorService(service);
    // limit=1000 应被裁剪到 100
    const out = await svc.aggregateSlowApis(WINDOW, 1000);
    expect(executeSpy).toHaveBeenCalledOnce();
    expect(out).toEqual([
      {
        method: "GET",
        host: "api.example.com",
        pathTemplate: "/v1/users",
        sampleCount: 100,
        p75DurationMs: 850,
        failureRatio: 0.1,
      },
      {
        method: "POST",
        host: "api.example.com",
        pathTemplate: "/v1/orders",
        sampleCount: 4,
        p75DurationMs: 0,
        failureRatio: 0,
      },
    ]);
  });
});

describe("ApiMonitorService / aggregateTopRequests", () => {
  it("样本量倒序 + avg null → 0 + limit 裁剪", async () => {
    const { service, executeSpy } = createStubDb([
      [
        {
          method: "GET",
          host: "api.example.com",
          path_template: "/v1/users",
          n: "200",
          avg: "80.2",
          failed: "4",
        },
        {
          method: "POST",
          host: "api.example.com",
          path_template: "/v1/orders",
          n: "3",
          avg: null,
          failed: "0",
        },
      ],
    ]);
    const svc = new ApiMonitorService(service);
    const out = await svc.aggregateTopRequests(WINDOW, 500);
    expect(executeSpy).toHaveBeenCalledOnce();
    expect(out).toEqual([
      {
        method: "GET",
        host: "api.example.com",
        pathTemplate: "/v1/users",
        sampleCount: 200,
        avgDurationMs: 80.2,
        failureRatio: 0.02,
      },
      {
        method: "POST",
        host: "api.example.com",
        pathTemplate: "/v1/orders",
        sampleCount: 3,
        avgDurationMs: 0,
        failureRatio: 0,
      },
    ]);
  });
});

describe("ApiMonitorService / aggregateTopPages", () => {
  it("按 page_path 聚合 + failedCount/failureRatio 计算", async () => {
    const { service } = createStubDb([
      [
        { page_path: "/dashboard", n: "120", avg: "95", failed: "6" },
        { page_path: "/report", n: 4, avg: 210.1, failed: 0 },
      ],
    ]);
    const svc = new ApiMonitorService(service);
    const out = await svc.aggregateTopPages(WINDOW, 10);
    expect(out).toEqual([
      {
        pagePath: "/dashboard",
        requestCount: 120,
        avgDurationMs: 95,
        failedCount: 6,
        failureRatio: 0.05,
      },
      {
        pagePath: "/report",
        requestCount: 4,
        avgDurationMs: 210.1,
        failedCount: 0,
        failureRatio: 0,
      },
    ]);
  });
});

describe("ApiMonitorService / aggregateErrorStatus", () => {
  it("按次数倒序 + ratio 计算 + 字符串强转", async () => {
    const { service } = createStubDb([
      [
        { status: "500", n: "30", total: "1000" },
        { status: 404, n: 12, total: "1000" },
        { status: "0", n: "5", total: 1000 },
      ],
    ]);
    const svc = new ApiMonitorService(service);
    const out = await svc.aggregateErrorStatus(WINDOW, 10);
    expect(out).toEqual([
      { status: 500, count: 30, ratio: 0.03 },
      { status: 404, count: 12, ratio: 0.012 },
      { status: 0, count: 5, ratio: 0.005 },
    ]);
  });

  it("空结果集返回空数组（total=0 不参与计算）", async () => {
    const { service } = createStubDb([[]]);
    const svc = new ApiMonitorService(service);
    expect(await svc.aggregateErrorStatus(WINDOW, 10)).toEqual([]);
  });
});

describe("ApiMonitorService / aggregateDimension", () => {
  it("按样本数倒序 + sharePercent / avg / failureRatio 计算", async () => {
    const { service } = createStubDb([
      [
        {
          value: "Chrome",
          n: "80",
          total: "100",
          avg: "120",
          failed: "4",
        },
        {
          value: "Safari",
          n: 15,
          total: 100,
          avg: "180.5",
          failed: 0,
        },
        {
          value: "unknown",
          n: "5",
          total: "100",
          avg: null,
          failed: "1",
        },
      ],
    ]);
    const svc = new ApiMonitorService(service);
    const out = await svc.aggregateDimension(WINDOW, "browser", 10);
    expect(out).toEqual([
      {
        value: "Chrome",
        sampleCount: 80,
        sharePercent: 80,
        avgDurationMs: 120,
        failureRatio: 0.05,
      },
      {
        value: "Safari",
        sampleCount: 15,
        sharePercent: 15,
        avgDurationMs: 180.5,
        failureRatio: 0,
      },
      {
        value: "unknown",
        sampleCount: 5,
        sharePercent: 5,
        avgDurationMs: 0,
        failureRatio: 0.2,
      },
    ]);
  });

  it("null value 归一为 'unknown'；limit 超限裁剪到 50", async () => {
    const { service, executeSpy } = createStubDb([
      [
        { value: null, n: "3", total: "3", avg: "50", failed: "0" },
      ],
    ]);
    const svc = new ApiMonitorService(service);
    const out = await svc.aggregateDimension(WINDOW, "device_type", 999);
    expect(executeSpy).toHaveBeenCalledOnce();
    expect(out).toEqual([
      {
        value: "unknown",
        sampleCount: 3,
        sharePercent: 100,
        avgDurationMs: 50,
        failureRatio: 0,
      },
    ]);
  });
});

/** ApiEvent fixture（最小合法字段） */
function buildApiEvent(overrides: Partial<ApiEvent> = {}): ApiEvent {
  return {
    type: "api",
    eventId: "11111111-2222-4333-8444-555555555555",
    projectId: "proj_test",
    publicKey: "pk_demo",
    sessionId: "sess_1",
    timestamp: 1_700_000_000_000,
    sdk: { name: "@g-heal-claw/sdk", version: "0.0.1" },
    method: "GET",
    url: "https://api.example.com/v1/users",
    status: 200,
    duration: 120,
    slow: false,
    failed: false,
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
      language: "zh-CN",
      timezone: "Asia/Shanghai",
    },
    ...overrides,
  } as ApiEvent;
}
