import { describe, it, expect, beforeEach, vi } from "vitest";
import { PerformanceService } from "../../../src/modules/performance/performance.service.js";
import type { DatabaseService } from "../../../src/shared/database/database.service.js";

/**
 * PerformanceService 聚合单测（ADR-0018 P1.2）
 *
 * 测试定位：**行 → DTO 的转换逻辑单测**，不是集成测试
 *  - 通过 stub `DatabaseService.db.execute()` 注入预制行数据
 *  - 验证：Number 强转、ISO 小时归一、Map 合并、分级桶、白名单映射
 *  - 不验证 SQL 自身正确性（由 Dockerized PG 集成测试负责，另行交付）
 *
 * 覆盖：
 *  - db=null 短路：saveBatch 0、aggregateLongTasks 零填充、5 个 aggregate 返空
 *  - aggregateVitals：字符串 p75/n 强转为 number；null p75 → 0
 *  - aggregateTrend：Date / ISO 字符串双路归一为 ISO；null p75 → 0
 *  - aggregateLongTasks：tier 三级分桶 + 总和 + p75 round
 *  - aggregateSlowPages：2-stage Map join + TTFB 缺失 path 补 0
 *  - aggregateFmpPages：AVG → Number + within3s 比例 + LCP Map join
 *  - aggregateDimension：null dim_value 兜底 "unknown"；字段白名单
 */

interface ExecuteStub {
  (sql: unknown): Promise<readonly Record<string, unknown>[]>;
}

/**
 * 构造 stub DatabaseService：每次调用 db.execute() 按注册顺序返回下一批行
 *
 * 不关心 SQL 字面量；只依次吐预制结果（每个聚合函数需要几次查询就 push 几批）
 */
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

describe("PerformanceService / db=null 短路", () => {
  const nullDb = { db: null } as unknown as DatabaseService;

  it("saveBatch 返回 0", async () => {
    const svc = new PerformanceService(nullDb);
    const out = await svc.saveBatch([]);
    expect(out).toBe(0);
  });

  it("aggregateVitals 返回空数组", async () => {
    const svc = new PerformanceService(nullDb);
    const out = await svc.aggregateVitals(WINDOW);
    expect(out).toEqual([]);
  });

  it("aggregateTrend 返回空数组", async () => {
    const svc = new PerformanceService(nullDb);
    const out = await svc.aggregateTrend(WINDOW);
    expect(out).toEqual([]);
  });

  it("aggregateLongTasks 返回零填充结构", async () => {
    const svc = new PerformanceService(nullDb);
    const out = await svc.aggregateLongTasks(WINDOW);
    expect(out).toEqual({
      count: 0,
      totalMs: 0,
      p75Ms: 0,
      tiers: { longTask: 0, jank: 0, unresponsive: 0 },
    });
  });

  it("aggregateSlowPages / FmpPages / Dimension 都返空", async () => {
    const svc = new PerformanceService(nullDb);
    expect(await svc.aggregateSlowPages(WINDOW, 10)).toEqual([]);
    expect(await svc.aggregateFmpPages(WINDOW, 10)).toEqual([]);
    expect(await svc.aggregateDimension(WINDOW, "browser")).toEqual([]);
    expect(await svc.aggregateWaterfallSamples(WINDOW)).toEqual([]);
    expect(await svc.countForProject("proj_test")).toBe(0);
  });
});

describe("PerformanceService / aggregateVitals 行映射", () => {
  it("字符串 p75/n 强转 number；null p75 → 0", async () => {
    const { service } = createStubDb([
      [
        { metric: "LCP", p75: "2345.6", n: "42" },
        { metric: "CLS", p75: 0.05, n: 100 },
        { metric: "FSP", p75: null, n: "0" },
      ],
    ]);
    const svc = new PerformanceService(service);
    const out = await svc.aggregateVitals(WINDOW);

    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ metric: "LCP", p75: 2345.6, sampleCount: 42 });
    expect(out[1]).toEqual({ metric: "CLS", p75: 0.05, sampleCount: 100 });
    expect(out[2]).toEqual({ metric: "FSP", p75: 0, sampleCount: 0 });
  });
});

describe("PerformanceService / aggregateTrend 时间归一", () => {
  it("Date 对象 / ISO 字符串双路归一为 ISO", async () => {
    const dateHour = new Date("2026-04-28T10:00:00.000Z");
    const { service } = createStubDb([
      [
        { hour: dateHour, metric: "LCP", p75: "2500" },
        { hour: "2026-04-28T11:00:00.000Z", metric: "LCP", p75: 2600 },
        { hour: "2026-04-28T12:00:00.000Z", metric: "SI", p75: null },
      ],
    ]);
    const svc = new PerformanceService(service);
    const out = await svc.aggregateTrend(WINDOW);

    expect(out).toHaveLength(3);
    expect(out[0].hour).toBe("2026-04-28T10:00:00.000Z");
    expect(out[0].p75).toBe(2500);
    expect(out[1].hour).toBe("2026-04-28T11:00:00.000Z");
    // null p75 兜底 0
    expect(out[2].p75).toBe(0);
    expect(out[2].metric).toBe("SI");
  });
});

describe("PerformanceService / aggregateLongTasks 3 级分桶", () => {
  it("按 tier_long / tier_jank / tier_unresponsive 返回结构", async () => {
    const { service } = createStubDb([
      [
        {
          n: "15",
          total: "12345.67",
          p75: "1800.4",
          tier_long: "10",
          tier_jank: "3",
          tier_unresponsive: "2",
        },
      ],
    ]);
    const svc = new PerformanceService(service);
    const out = await svc.aggregateLongTasks(WINDOW);

    expect(out.count).toBe(15);
    expect(out.totalMs).toBe(12346); // 四舍五入
    expect(out.p75Ms).toBe(1800); // 四舍五入
    expect(out.tiers).toEqual({
      longTask: 10,
      jank: 3,
      unresponsive: 2,
    });
  });

  it("空窗口 → 零填充", async () => {
    const { service } = createStubDb([[]]);
    const svc = new PerformanceService(service);
    const out = await svc.aggregateLongTasks(WINDOW);
    expect(out).toEqual({
      count: 0,
      totalMs: 0,
      p75Ms: 0,
      tiers: { longTask: 0, jank: 0, unresponsive: 0 },
    });
  });
});

describe("PerformanceService / aggregateSlowPages 2-stage Map 合并", () => {
  it("LCP 排序 + TTFB 二轮查询 Map join；无 TTFB 的 path 补 0", async () => {
    const { service } = createStubDb([
      // 第 1 轮 LCP
      [
        { path: "/home", n: "20", lcp_p75: "3500.5" },
        { path: "/about", n: "5", lcp_p75: "2800" },
      ],
      // 第 2 轮 TTFB（仅 /home，/about 缺失应兜底 0）
      [{ path: "/home", ttfb_p75: "420.7" }],
    ]);
    const svc = new PerformanceService(service);
    const out = await svc.aggregateSlowPages(WINDOW, 10);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      path: "/home",
      sampleCount: 20,
      lcpP75Ms: 3500.5,
      ttfbP75Ms: 420.7,
    });
    expect(out[1]).toMatchObject({
      path: "/about",
      ttfbP75Ms: 0, // 未命中 Map → 0
    });
  });

  it("第 1 轮空 → 不触发第 2 轮，直接返空", async () => {
    const { service, executeSpy } = createStubDb([[]]);
    const svc = new PerformanceService(service);
    const out = await svc.aggregateSlowPages(WINDOW, 10);
    expect(out).toEqual([]);
    // 只应触发 1 次 execute（短路第 2 轮）
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });
});

describe("PerformanceService / aggregateFmpPages", () => {
  it("FSP AVG + 3s 比例 + LCP 二轮 Map 合并", async () => {
    const { service } = createStubDb([
      [
        { path: "/home", n: "30", fmp_avg: "2500.3", within3s: "0.8" },
        { path: "/orders", n: "15", fmp_avg: "3500", within3s: 0.4 },
      ],
      [{ path: "/home", lcp_avg: "2800.9" }],
    ]);
    const svc = new PerformanceService(service);
    const out = await svc.aggregateFmpPages(WINDOW, 5);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      path: "/home",
      sampleCount: 30,
      fmpAvgMs: 2500.3,
      fullyLoadedAvgMs: 2800.9,
      within3sRatio: 0.8,
    });
    // /orders 缺 LCP → 0
    expect(out[1].fullyLoadedAvgMs).toBe(0);
    expect(out[1].within3sRatio).toBe(0.4);
  });
});

describe("PerformanceService / aggregateDimension", () => {
  let executeSpy: ReturnType<typeof vi.fn>;
  let svc: PerformanceService;

  beforeEach(() => {
    const stub = createStubDb([
      [
        { dim_value: "Chrome", n: "80", fmp_avg: "2100.4" },
        { dim_value: null, n: "5", fmp_avg: null },
      ],
    ]);
    executeSpy = stub.executeSpy;
    svc = new PerformanceService(stub.service);
  });

  it("null dim_value 兜底 unknown；null fmp_avg → 0", async () => {
    const out = await svc.aggregateDimension(WINDOW, "browser");
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      value: "Chrome",
      sampleCount: 80,
      fmpAvgMs: 2100, // round
    });
    expect(out[1]).toEqual({
      value: "unknown",
      sampleCount: 5,
      fmpAvgMs: 0,
    });
  });

  it("执行了 1 次 SQL（单 query 走白名单映射）", async () => {
    await svc.aggregateDimension(WINDOW, "deviceType");
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });
});

describe("PerformanceService / aggregateWaterfallSamples 过滤 null", () => {
  it("null navigation 行应被过滤", async () => {
    const sample = {
      dns: 10,
      tcp: 20,
      ssl: 30,
      request: 40,
      response: 50,
      domParse: 60,
      resourceLoad: 70,
    };
    const { service } = createStubDb([
      [
        { navigation: sample },
        { navigation: null },
        { navigation: { ...sample, dns: 15 } },
      ],
    ]);
    const svc = new PerformanceService(service);
    const out = await svc.aggregateWaterfallSamples(WINDOW, 10);
    expect(out).toHaveLength(2);
    expect(out[0].dns).toBe(10);
    expect(out[1].dns).toBe(15);
  });
});
