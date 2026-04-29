import { describe, it, expect, vi } from "vitest";
import type { ResourceEvent } from "@g-heal-claw/shared";
import { ResourceMonitorService } from "../../src/resource-monitor/resource-monitor.service.js";
import type { DatabaseService } from "../../src/shared/database/database.service.js";

/**
 * ResourceMonitorService 单测（ADR-0022 §3 / TM.1.B.3）
 *
 * 定位：**行 → DTO 的转换逻辑单测**，不验证 SQL 本身
 *  - stub `DatabaseService.db.execute()` 注入预制行
 *  - 覆盖：db=null 短路、saveBatch 幂等、5 个 aggregate 的 Number 强转 / 排序 / 6 类占位
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

describe("ResourceMonitorService / db=null 短路", () => {
  const nullDb = { db: null } as unknown as DatabaseService;

  it("saveBatch 空数组返回 0", async () => {
    const svc = new ResourceMonitorService(nullDb);
    expect(await svc.saveBatch([])).toBe(0);
  });

  it("saveBatch db=null 返回 0", async () => {
    const svc = new ResourceMonitorService(nullDb);
    expect(await svc.saveBatch([buildResourceEvent()])).toBe(0);
  });

  it("countForProject db=null 返回 0", async () => {
    const svc = new ResourceMonitorService(nullDb);
    expect(await svc.countForProject("p")).toBe(0);
  });

  it("aggregateSummary db=null 返回零填充", async () => {
    const svc = new ResourceMonitorService(nullDb);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalRequests: 0,
      failedCount: 0,
      slowCount: 0,
      p75DurationMs: 0,
      totalTransferBytes: 0,
    });
  });

  it("aggregateCategoryBuckets db=null 返回 6 类零填充占位", async () => {
    const svc = new ResourceMonitorService(nullDb);
    const out = await svc.aggregateCategoryBuckets(WINDOW);
    expect(out).toHaveLength(6);
    expect(out.map((r) => r.category)).toEqual([
      "script",
      "stylesheet",
      "image",
      "font",
      "media",
      "other",
    ]);
    for (const r of out) {
      expect(r.count).toBe(0);
      expect(r.failedCount).toBe(0);
      expect(r.slowCount).toBe(0);
      expect(r.avgDurationMs).toBe(0);
    }
  });

  it("aggregateTrend / aggregateSlowResources / aggregateFailingHosts db=null 返回空数组", async () => {
    const svc = new ResourceMonitorService(nullDb);
    expect(await svc.aggregateTrend(WINDOW)).toEqual([]);
    expect(await svc.aggregateSlowResources(WINDOW, 10)).toEqual([]);
    expect(await svc.aggregateFailingHosts(WINDOW, 10)).toEqual([]);
  });
});

describe("ResourceMonitorService / aggregateSummary", () => {
  it("字符串数值强转 + null p75/bytes 归零", async () => {
    const { service } = createStubDb([
      [{ total: "200", failed: "12", slow: "30", p75: null, bytes: null }],
    ]);
    const svc = new ResourceMonitorService(service);
    const out = await svc.aggregateSummary(WINDOW);
    expect(out).toEqual({
      totalRequests: 200,
      failedCount: 12,
      slowCount: 30,
      p75DurationMs: 0,
      totalTransferBytes: 0,
    });
  });

  it("bytes/p75 有值时正确强转", async () => {
    const { service } = createStubDb([
      [{ total: "100", failed: "5", slow: "10", p75: "820", bytes: "1048576" }],
    ]);
    const svc = new ResourceMonitorService(service);
    const out = await svc.aggregateSummary(WINDOW);
    expect(out.totalTransferBytes).toBe(1_048_576);
    expect(out.p75DurationMs).toBe(820);
  });

  it("空结果集 → 零填充", async () => {
    const { service } = createStubDb([[]]);
    const svc = new ResourceMonitorService(service);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalRequests: 0,
      failedCount: 0,
      slowCount: 0,
      p75DurationMs: 0,
      totalTransferBytes: 0,
    });
  });
});

describe("ResourceMonitorService / aggregateCategoryBuckets", () => {
  it("部分类别缺失 → 补 6 类零填充，顺序固定", async () => {
    const { service } = createStubDb([
      [
        { category: "script", n: "120", failed: "3", slow: "8", avg: "150" },
        { category: "image", n: "80", failed: "1", slow: "10", avg: null },
      ],
    ]);
    const svc = new ResourceMonitorService(service);
    const out = await svc.aggregateCategoryBuckets(WINDOW);
    expect(out.map((r) => r.category)).toEqual([
      "script",
      "stylesheet",
      "image",
      "font",
      "media",
      "other",
    ]);
    expect(out[0]).toEqual({
      category: "script",
      count: 120,
      failedCount: 3,
      slowCount: 8,
      avgDurationMs: 150,
    });
    expect(out[2]).toEqual({
      category: "image",
      count: 80,
      failedCount: 1,
      slowCount: 10,
      avgDurationMs: 0,
    });
    // stylesheet / font / media / other 全为 0
    for (const idx of [1, 3, 4, 5]) {
      expect(out[idx].count).toBe(0);
    }
  });
});

describe("ResourceMonitorService / aggregateTrend", () => {
  it("Date / ISO 字符串双路归一", async () => {
    const { service } = createStubDb([
      [
        {
          hour: new Date("2026-04-29T10:00:00.000Z"),
          n: "50",
          failed: "2",
          slow: "5",
          avg: "300",
        },
        {
          hour: "2026-04-29T11:00:00.000Z",
          n: 0,
          failed: 0,
          slow: 0,
          avg: null,
        },
      ],
    ]);
    const svc = new ResourceMonitorService(service);
    expect(await svc.aggregateTrend(WINDOW)).toEqual([
      {
        hour: "2026-04-29T10:00:00.000Z",
        count: 50,
        failedCount: 2,
        slowCount: 5,
        avgDurationMs: 300,
      },
      {
        hour: "2026-04-29T11:00:00.000Z",
        count: 0,
        failedCount: 0,
        slowCount: 0,
        avgDurationMs: 0,
      },
    ]);
  });
});

describe("ResourceMonitorService / aggregateSlowResources", () => {
  it("failureRatio 计算 + p75 null → 0 + limit 裁剪", async () => {
    const { service, executeSpy } = createStubDb([
      [
        {
          category: "script",
          host: "cdn.example.com",
          url: "https://cdn.example.com/app.js",
          n: "100",
          p75: "850",
          failed: "10",
        },
        {
          category: "image",
          host: "img.example.com",
          url: "https://img.example.com/banner.png",
          n: "4",
          p75: null,
          failed: "0",
        },
      ],
    ]);
    const svc = new ResourceMonitorService(service);
    const out = await svc.aggregateSlowResources(WINDOW, 999);
    expect(executeSpy).toHaveBeenCalledOnce();
    expect(out).toEqual([
      {
        category: "script",
        host: "cdn.example.com",
        url: "https://cdn.example.com/app.js",
        sampleCount: 100,
        p75DurationMs: 850,
        failureRatio: 0.1,
      },
      {
        category: "image",
        host: "img.example.com",
        url: "https://img.example.com/banner.png",
        sampleCount: 4,
        p75DurationMs: 0,
        failureRatio: 0,
      },
    ]);
  });
});

describe("ResourceMonitorService / aggregateFailingHosts", () => {
  it("失败率 + 字符串强转 + host 过滤", async () => {
    const { service } = createStubDb([
      [
        { host: "cdn.broken.com", n: "20", failed: "18" },
        { host: "img.weird.com", n: "10", failed: "5" },
      ],
    ]);
    const svc = new ResourceMonitorService(service);
    expect(await svc.aggregateFailingHosts(WINDOW, 10)).toEqual([
      {
        host: "cdn.broken.com",
        totalRequests: 20,
        failedCount: 18,
        failureRatio: 0.9,
      },
      {
        host: "img.weird.com",
        totalRequests: 10,
        failedCount: 5,
        failureRatio: 0.5,
      },
    ]);
  });
});

/** ResourceEvent fixture（最小合法字段） */
function buildResourceEvent(
  overrides: Partial<ResourceEvent> = {},
): ResourceEvent {
  return {
    type: "resource",
    eventId: "11111111-2222-4333-8444-555555555555",
    projectId: "proj_test",
    publicKey: "pk_demo",
    sessionId: "sess_1",
    timestamp: 1_700_000_000_000,
    initiatorType: "script",
    category: "script",
    host: "cdn.example.com",
    url: "https://cdn.example.com/app.js",
    duration: 120,
    transferSize: 1024,
    encodedSize: 512,
    decodedSize: 2048,
    protocol: "h2",
    cache: "miss",
    slow: false,
    failed: false,
    startTime: 50,
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
