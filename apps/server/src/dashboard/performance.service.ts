import { Injectable, Logger } from "@nestjs/common";
import type { NavigationTiming } from "@g-heal-claw/shared";
import {
  PerformanceService,
  type SlowPageAggregateRow,
  type TrendAggregateRow,
  type VitalAggregateRow,
  type WindowParams,
} from "../performance/performance.service.js";
import type {
  DeltaDirection,
  LoadStageDto,
  LoadStageKey,
  OverviewQuery,
  PerformanceOverviewDto,
  SlowPageDto,
  ThresholdTone,
  TrendBucketDto,
  VitalKey,
  VitalMetricDto,
} from "./dto/overview.dto.js";

/**
 * Dashboard 性能大盘装配层（ADR-0015）
 *
 * 职责：
 * - 两次时间窗（当前 / 前一周期）调 `PerformanceService` 聚合查询
 * - 将 DB 行映射为面向前端的 `PerformanceOverviewDto`
 * - 空数据降级：返回占位结构而非抛错，让前端渲染"暂无数据"
 */
@Injectable()
export class DashboardPerformanceService {
  private readonly logger = new Logger(DashboardPerformanceService.name);

  public constructor(private readonly perf: PerformanceService) {}

  public async getOverview(query: OverviewQuery): Promise<PerformanceOverviewDto> {
    const { projectId, windowHours, limitSlowPages } = query;
    const now = Date.now();
    const windowMs = windowHours * 3600_000;

    const current: WindowParams = {
      projectId,
      sinceMs: now - windowMs,
      untilMs: now,
    };
    const previous: WindowParams = {
      projectId,
      sinceMs: now - 2 * windowMs,
      untilMs: now - windowMs,
    };

    // 并发四次聚合 + 一次环比，DB 端没有竞争
    const [
      vitalsCurrent,
      vitalsPrevious,
      trendRows,
      waterfallSamples,
      slowPageRows,
    ] = await Promise.all([
      this.perf.aggregateVitals(current),
      this.perf.aggregateVitals(previous),
      this.perf.aggregateTrend(current),
      this.perf.aggregateWaterfallSamples(current),
      this.perf.aggregateSlowPages(current, limitSlowPages),
    ]);

    const vitals = buildVitals(vitalsCurrent, vitalsPrevious);
    const trend = buildTrendBuckets(trendRows);
    const stages = buildStages(
      waterfallSamples,
      vitalFromAggregate(vitalsCurrent, "FCP") ?? 0,
      vitalFromAggregate(vitalsCurrent, "LCP") ?? 0,
    );
    const slowPages = buildSlowPages(slowPageRows);

    return { vitals, stages, trend, slowPages };
  }
}

// ------- Vitals -------

const VITAL_ORDER: readonly VitalKey[] = ["LCP", "FCP", "CLS", "INP", "TTFB"];

/** web-vitals 官方阈值（ADR-0014 / ADR-0015 §4） */
const THRESHOLDS: Record<VitalKey, readonly [good: number, ni: number]> = {
  LCP: [2500, 4000],
  FCP: [1800, 3000],
  CLS: [0.1, 0.25],
  INP: [200, 500],
  TTFB: [800, 1800],
};

function vitalFromAggregate(
  rows: readonly VitalAggregateRow[],
  key: VitalKey,
): number | undefined {
  return rows.find((r) => r.metric === key)?.p75;
}

function sampleFromAggregate(
  rows: readonly VitalAggregateRow[],
  key: VitalKey,
): number {
  return rows.find((r) => r.metric === key)?.sampleCount ?? 0;
}

function buildVitals(
  current: readonly VitalAggregateRow[],
  previous: readonly VitalAggregateRow[],
): VitalMetricDto[] {
  return VITAL_ORDER.map((key) => {
    const value = vitalFromAggregate(current, key) ?? 0;
    const sampleCount = sampleFromAggregate(current, key);
    const prev = vitalFromAggregate(previous, key);

    const { deltaPercent, deltaDirection } = computeDelta(value, prev);

    return {
      key,
      value: roundVital(key, value),
      unit: key === "CLS" ? "" : "ms",
      tone: toneFor(key, value),
      deltaPercent,
      deltaDirection,
      sampleCount,
    } satisfies VitalMetricDto;
  });
}

function roundVital(key: VitalKey, v: number): number {
  // CLS 保留 2 位小数，其余取整 ms
  if (key === "CLS") return Math.round(v * 100) / 100;
  return Math.round(v);
}

function toneFor(key: VitalKey, v: number): ThresholdTone {
  const [good, ni] = THRESHOLDS[key];
  if (v <= good) return "good";
  if (v <= ni) return "warn";
  return "destructive";
}

function computeDelta(
  current: number,
  previous: number | undefined,
): { deltaPercent: number; deltaDirection: DeltaDirection } {
  if (previous == null || previous === 0 || current === 0) {
    return { deltaPercent: 0, deltaDirection: "flat" };
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (Math.abs(rounded) < 0.1) {
    return { deltaPercent: 0, deltaDirection: "flat" };
  }
  return {
    deltaPercent: Math.abs(rounded),
    deltaDirection: rounded > 0 ? "up" : "down",
  };
}

// ------- Trend -------

function buildTrendBuckets(rows: readonly TrendAggregateRow[]): TrendBucketDto[] {
  if (rows.length === 0) return [];
  // 按 hour 聚成宽表；同一小时内 4 个 metric 各占一行
  const byHour = new Map<
    string,
    { lcpP75: number; fcpP75: number; inpP75: number; ttfbP75: number }
  >();
  for (const r of rows) {
    const cur =
      byHour.get(r.hour) ??
      ({ lcpP75: 0, fcpP75: 0, inpP75: 0, ttfbP75: 0 } as const);
    const next = { ...cur };
    const p75 = Math.round(r.p75);
    switch (r.metric) {
      case "LCP":
        next.lcpP75 = p75;
        break;
      case "FCP":
        next.fcpP75 = p75;
        break;
      case "INP":
        next.inpP75 = p75;
        break;
      case "TTFB":
        next.ttfbP75 = p75;
        break;
      default:
        // 其他指标忽略（不画在趋势图上）
        break;
    }
    byHour.set(r.hour, next);
  }
  return [...byHour.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([hour, v]) => ({ hour, ...v }));
}

// ------- Waterfall -------

/**
 * Navigation 样本 → 9 阶段瀑布（dns/tcp/ssl/request/response/domParse/resourceLoad + firstScreen + lcp）
 *
 * - 前 7 阶段用样本各字段的中位数串联（cursor 累积）
 * - firstScreen / lcp 作为整体指标（从 0 起），前者没有独立 metric 先用 FCP 替代
 */
function buildStages(
  samples: readonly NavigationTiming[],
  firstScreenMs: number,
  lcpMs: number,
): LoadStageDto[] {
  const dns = median(samples.map((s) => s.dns));
  const tcp = median(samples.map((s) => s.tcp));
  const ssl = median(samples.map((s) => s.ssl ?? 0));
  const request = median(samples.map((s) => s.request));
  const response = median(samples.map((s) => s.response));
  const domParse = median(samples.map((s) => s.domParse));
  const resourceLoad = median(samples.map((s) => s.resourceLoad));

  const serial: readonly (readonly [LoadStageKey, string, number])[] = [
    ["dns", "DNS 查询", Math.round(dns)],
    ["tcp", "TCP 连接", Math.round(tcp)],
    ["ssl", "SSL 建连", Math.round(ssl)],
    ["request", "请求响应", Math.round(request)],
    ["response", "内容传输", Math.round(response)],
    ["domParse", "内容解析", Math.round(domParse)],
    ["resourceLoad", "资源加载", Math.round(resourceLoad)],
  ];

  let cursor = 0;
  const stages: LoadStageDto[] = [];
  for (const [key, label, ms] of serial) {
    const startMs = cursor;
    const endMs = startMs + ms;
    cursor = endMs;
    stages.push({ key, label, ms, startMs, endMs });
  }

  // 整体指标从 0 开始；两者均为 0 时不附加（前端视为无数据）
  if (firstScreenMs > 0) {
    const ms = Math.round(firstScreenMs);
    stages.push({ key: "firstScreen", label: "首屏耗时", ms, startMs: 0, endMs: ms });
  }
  if (lcpMs > 0) {
    const ms = Math.round(lcpMs);
    stages.push({ key: "lcp", label: "LCP", ms, startMs: 0, endMs: ms });
  }

  // 样本 < 1 时 serial 阶段全为 0，整体指标也为 0，直接返回空
  if (samples.length === 0 && firstScreenMs <= 0 && lcpMs <= 0) return [];
  return stages;
}

function median(nums: readonly number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

// ------- Slow Pages -------

function buildSlowPages(rows: readonly SlowPageAggregateRow[]): SlowPageDto[] {
  return rows.map((r) => ({
    url: r.path, // 当前 path 字段即页面 URL path，列名沿用 SlowPage.url 与前端契约一致
    sampleCount: r.sampleCount,
    lcpP75Ms: Math.round(r.lcpP75Ms),
    ttfbP75Ms: Math.round(r.ttfbP75Ms),
    bounceRate: 0,
  }));
}
