import { describe, it, expect } from "vitest";
import { calcHealth } from "../../../src/dashboard/dashboard/overview.service.js";
import type {
  ApiSummaryDto,
  ErrorsSummaryDto,
  PerformanceSummaryDto,
  ResourcesSummaryDto,
} from "../../../src/dashboard/dashboard/dto/overview-summary.dto.js";

/**
 * DashboardOverviewService.calcHealth 单测（ADR-0029）
 *
 * 覆盖：
 *  1. 全 live + 低信号 → score 接近 100，tone=good
 *  2. 错误率在 start~full 之间 → 线性扣分
 *  3. LCP destructive → 扣满 performance 权重
 *  4. API 错误率 > full → API 权重扣满
 *  5. 资源失败率 > full → resources 权重扣满
 *  6. 单域 empty → 权重重分配，其他域按原比例放大
 *  7. 多域 empty + 单域 live → 活跃域分摊剩余权重
 *  8. 全域 empty → score=null, tone=unknown
 *  9. 单域 error 不影响其他域评分
 *  10. 组合：errors 扣满 + API destructive → score 低且 tone=destructive
 */

const liveErrorsOk = (): ErrorsSummaryDto => ({
  totalEvents: 1,
  impactedSessions: 100,
  deltaPercent: 0,
  deltaDirection: "flat",
  source: "live",
});

const livePerfOk = (): PerformanceSummaryDto => ({
  lcpP75Ms: 2000,
  inpP75Ms: 100,
  clsP75: 0.05,
  tone: "good",
  source: "live",
});

const liveApiOk = (): ApiSummaryDto => ({
  totalRequests: 1000,
  errorRate: 0.005,
  p75DurationMs: 100,
  source: "live",
});

const liveResOk = (): ResourcesSummaryDto => ({
  totalRequests: 500,
  failureRate: 0.01,
  slowCount: 0,
  source: "live",
});

const empty = <T extends { source: string }>(dto: T): T => ({
  ...dto,
  source: "empty",
});

const errored = <T extends { source: string }>(dto: T): T => ({
  ...dto,
  source: "error",
});

describe("calcHealth", () => {
  it("全域 live + 低信号 → score 接近 100, tone=good", () => {
    const h = calcHealth({
      errors: liveErrorsOk(),
      performance: livePerfOk(),
      api: liveApiOk(),
      resources: liveResOk(),
    });
    expect(h.tone).toBe("good");
    expect(h.score).not.toBeNull();
    expect(h.score!).toBeGreaterThanOrEqual(95);
    expect(h.components).toHaveLength(4);
    // 权重合计应为 100（全参与，无重分配）
    const totalWeight = h.components.reduce((a, c) => a + c.weight, 0);
    expect(totalWeight).toBeCloseTo(100, 1);
  });

  it("API 错误率 >= full(10%) 扣满 API 权重（20）", () => {
    const h = calcHealth({
      errors: empty(liveErrorsOk()),
      performance: empty(livePerfOk()),
      api: { ...liveApiOk(), errorRate: 0.15 },
      resources: empty(liveResOk()),
    });
    // 仅 API 参与（权重归一 100）
    expect(h.components.find((c) => c.key === "api")!.weight).toBeCloseTo(100, 1);
    expect(h.components.find((c) => c.key === "api")!.deducted).toBeCloseTo(100, 1);
    expect(h.score).toBe(0);
    expect(h.tone).toBe("destructive");
  });

  it("LCP destructive（>4000ms）扣满 performance 权重", () => {
    const h = calcHealth({
      errors: liveErrorsOk(),
      performance: { ...livePerfOk(), lcpP75Ms: 5000, tone: "destructive" },
      api: liveApiOk(),
      resources: liveResOk(),
    });
    const perf = h.components.find((c) => c.key === "performance")!;
    // perf 权重 25，扣满
    expect(perf.weight).toBeCloseTo(25, 1);
    expect(perf.deducted).toBeCloseTo(25, 1);
    expect(h.score).toBeLessThanOrEqual(75);
  });

  it("LCP warn（2500~4000ms）扣 0.6 × weight", () => {
    const h = calcHealth({
      errors: liveErrorsOk(),
      performance: { ...livePerfOk(), lcpP75Ms: 3000, tone: "warn" },
      api: liveApiOk(),
      resources: liveResOk(),
    });
    const perf = h.components.find((c) => c.key === "performance")!;
    expect(perf.deducted).toBeCloseTo(25 * 0.6, 1);
  });

  it("资源失败率 >= full(20%) 扣满 resources 权重（15）", () => {
    const h = calcHealth({
      errors: empty(liveErrorsOk()),
      performance: empty(livePerfOk()),
      api: empty(liveApiOk()),
      resources: { ...liveResOk(), failureRate: 0.3 },
    });
    const res = h.components.find((c) => c.key === "resources")!;
    expect(res.weight).toBeCloseTo(100, 1);
    expect(res.deducted).toBeCloseTo(100, 1);
  });

  it("单域 empty 时剩余三域按原比例放大到 100", () => {
    const h = calcHealth({
      errors: empty(liveErrorsOk()),
      performance: livePerfOk(),
      api: liveApiOk(),
      resources: liveResOk(),
    });
    // 其余三域原始权重 25 + 20 + 15 = 60；放大系数 100/60
    const scale = 100 / 60;
    const perf = h.components.find((c) => c.key === "performance")!;
    const api = h.components.find((c) => c.key === "api")!;
    const res = h.components.find((c) => c.key === "resources")!;
    const errs = h.components.find((c) => c.key === "errors")!;
    expect(perf.weight).toBeCloseTo(25 * scale, 1);
    expect(api.weight).toBeCloseTo(20 * scale, 1);
    expect(res.weight).toBeCloseTo(15 * scale, 1);
    expect(errs.weight).toBe(0);
  });

  it("多域 empty + 单域 live → 活跃域独占 100 权重", () => {
    const h = calcHealth({
      errors: empty(liveErrorsOk()),
      performance: empty(livePerfOk()),
      api: empty(liveApiOk()),
      resources: liveResOk(),
    });
    const res = h.components.find((c) => c.key === "resources")!;
    expect(res.weight).toBeCloseTo(100, 1);
  });

  it("全域 empty → score=null, tone=unknown, components=[]", () => {
    const h = calcHealth({
      errors: empty(liveErrorsOk()),
      performance: empty(livePerfOk()),
      api: empty(liveApiOk()),
      resources: empty(liveResOk()),
    });
    expect(h.score).toBeNull();
    expect(h.tone).toBe("unknown");
    expect(h.components).toEqual([]);
  });

  it("单域 error 不影响其他域评分（权重重分配）", () => {
    const h = calcHealth({
      errors: errored(liveErrorsOk()),
      performance: livePerfOk(),
      api: liveApiOk(),
      resources: liveResOk(),
    });
    // errors 不参与，应与"errors empty" 结果一致
    const errs = h.components.find((c) => c.key === "errors")!;
    expect(errs.weight).toBe(0);
    expect(errs.deducted).toBe(0);
    expect(h.tone).toBe("good");
  });

  it("errors 高 + API destructive → score 显著下降且 tone=destructive/warn", () => {
    const h = calcHealth({
      errors: { ...liveErrorsOk(), totalEvents: 100, impactedSessions: 10 },
      performance: livePerfOk(),
      api: { ...liveApiOk(), errorRate: 0.5 },
      resources: liveResOk(),
    });
    // API 扣满（权重 20），errors signal=10/10/100=0.01 落在 start~full 区间，约 5/45*40≈4.4
    expect(h.score).not.toBeNull();
    expect(h.score!).toBeLessThan(85);
  });

  it("score 不会为负（overflow 兜底）", () => {
    const h = calcHealth({
      errors: { ...liveErrorsOk(), totalEvents: 99999, impactedSessions: 1 },
      performance: { ...livePerfOk(), lcpP75Ms: 10000, tone: "destructive" },
      api: { ...liveApiOk(), errorRate: 0.99 },
      resources: { ...liveResOk(), failureRate: 0.99 },
    });
    expect(h.score).toBeGreaterThanOrEqual(0);
    expect(h.score).toBeLessThanOrEqual(100);
  });
});
