import { Injectable, Logger } from "@nestjs/common";
import type { NavigationTiming } from "@g-heal-claw/shared";
import {
  PerformanceService,
  type DimensionAggregateRow,
  type FmpPageAggregateRow,
  type LongTaskSummaryRow,
  type NavigationTrendRow,
  type SlowPageAggregateRow,
  type TrendAggregateRow,
  type VitalAggregateRow,
  type WindowParams,
} from "../performance/performance.service.js";
import type {
  DeltaDirection,
  DimensionRowDto,
  DimensionsDto,
  FmpPageDto,
  LoadStageDto,
  LoadStageKey,
  LongTaskSummaryDto,
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

    // 并发聚合，DB 端没有竞争
    const [
      vitalsCurrent,
      vitalsPrevious,
      trendRows,
      navTrendRows,
      waterfallSamples,
      slowPageRows,
      fmpPageRows,
      browserRows,
      osRows,
      platformRows,
      longTasksCurrent,
    ] = await Promise.all([
      this.perf.aggregateVitals(current),
      this.perf.aggregateVitals(previous),
      this.perf.aggregateTrend(current),
      this.perf.aggregateNavigationTrend(current),
      this.perf.aggregateWaterfallSamples(current),
      this.perf.aggregateSlowPages(current, limitSlowPages),
      this.perf.aggregateFmpPages(current, limitSlowPages),
      this.perf.aggregateDimension(current, "browser"),
      this.perf.aggregateDimension(current, "os"),
      this.perf.aggregateDimension(current, "deviceType"),
      this.perf.aggregateLongTasks(current),
    ]);

    const vitals = buildVitals(vitalsCurrent, vitalsPrevious);
    const trend = buildTrendBuckets(trendRows, navTrendRows);
    const stages = buildStages(
      waterfallSamples,
      vitalFromAggregate(vitalsCurrent, "FCP") ?? 0,
      vitalFromAggregate(vitalsCurrent, "LCP") ?? 0,
    );
    const slowPages = buildSlowPages(slowPageRows);
    const fmpPages = buildFmpPages(fmpPageRows);
    const dimensions: DimensionsDto = {
      browser: buildDimensionRows(browserRows),
      os: buildDimensionRows(osRows),
      platform: buildDimensionRows(platformRows),
    };

    const longTasks = buildLongTasks(longTasksCurrent);

    return { vitals, stages, trend, slowPages, fmpPages, dimensions, longTasks };
  }
}

function buildLongTasks(row: LongTaskSummaryRow): LongTaskSummaryDto {
  return {
    count: row.count,
    totalMs: row.totalMs,
    p75Ms: row.p75Ms,
    tiers: {
      longTask: row.tiers.longTask,
      jank: row.tiers.jank,
      unresponsive: row.tiers.unresponsive,
    },
  };
}

// ------- Vitals -------

// 面板顺序（按业务要求）：LCP → INP → CLS → TTFB → FCP → TTI → TBT → FID → SI
// SI（Speed Index）由 SDK speedIndexPlugin 用 FP/FCP/LCP 梯形法 AUC 近似（ADR-0018，精度 ±20%）
const VITAL_ORDER: readonly VitalKey[] = [
  "LCP",
  "INP",
  "CLS",
  "TTFB",
  "FCP",
  "TTI",
  "TBT",
  "FID",
  "SI",
];

/** web-vitals 官方阈值（ADR-0014 / ADR-0015 §4；FID/TTI 已废弃；TBT/SI 为 Lighthouse 阈值） */
const THRESHOLDS: Record<VitalKey, readonly [good: number, ni: number]> = {
  LCP: [2500, 4000],
  FCP: [1800, 3000],
  CLS: [0.1, 0.25],
  INP: [200, 500],
  TTFB: [800, 1800],
  FID: [100, 300],
  TTI: [3800, 7300],
  TBT: [200, 600],
  SI: [3400, 5800],
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
  // CLS 保留 3 位小数（2 位会把 0.003 吞成 0，掩盖真实值）；其余取整 ms
  if (key === "CLS") return Math.round(v * 1000) / 1000;
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

interface TrendBucketAccumulator {
  lcpP75: number;
  fcpP75: number;
  clsP75: number;
  inpP75: number;
  ttfbP75: number;
  fidP75: number;
  ttiP75: number;
  tbtP75: number;
  fmpP75: number;
  siP75: number;
  dnsP75: number;
  tcpP75: number;
  sslP75: number;
  contentDownloadP75: number;
  domParseP75: number;
  resourceLoadP75: number;
  sampleCount: number;
}

function createEmptyBucket(): TrendBucketAccumulator {
  return {
    lcpP75: 0,
    fcpP75: 0,
    clsP75: 0,
    inpP75: 0,
    ttfbP75: 0,
    fidP75: 0,
    ttiP75: 0,
    tbtP75: 0,
    fmpP75: 0,
    siP75: 0,
    dnsP75: 0,
    tcpP75: 0,
    sslP75: 0,
    contentDownloadP75: 0,
    domParseP75: 0,
    resourceLoadP75: 0,
    sampleCount: 0,
  };
}

/**
 * 合并两路聚合（每指标 p75 + Navigation 子字段 p75）为宽表
 *
 * 返回按小时升序的 TrendBucketDto[]。
 * sampleCount 取"当小时所有系列中最大样本数"作为 PV 近似。
 */
function buildTrendBuckets(
  rows: readonly TrendAggregateRow[],
  navRows: readonly NavigationTrendRow[],
): TrendBucketDto[] {
  if (rows.length === 0 && navRows.length === 0) return [];
  const byHour = new Map<string, TrendBucketAccumulator>();

  const getOrInit = (hour: string): TrendBucketAccumulator => {
    let b = byHour.get(hour);
    if (!b) {
      b = createEmptyBucket();
      byHour.set(hour, b);
    }
    return b;
  };

  for (const r of rows) {
    const b = getOrInit(r.hour);
    // CLS 保留 3 位小数，其余取整 ms
    const value = r.metric === "CLS" ? Math.round(r.p75 * 1000) / 1000 : Math.round(r.p75);
    switch (r.metric) {
      case "LCP":
        b.lcpP75 = value;
        break;
      case "FCP":
        b.fcpP75 = value;
        break;
      case "CLS":
        b.clsP75 = value;
        break;
      case "INP":
        b.inpP75 = value;
        break;
      case "TTFB":
        b.ttfbP75 = value;
        break;
      case "FID":
        b.fidP75 = value;
        break;
      case "TTI":
        b.ttiP75 = value;
        break;
      case "TBT":
        b.tbtP75 = value;
        break;
      case "FSP":
        b.fmpP75 = value;
        break;
      case "SI":
        b.siP75 = value;
        break;
      default:
        break;
    }
  }

  for (const n of navRows) {
    const b = getOrInit(n.hour);
    b.dnsP75 = Math.round(n.dnsP75);
    b.tcpP75 = Math.round(n.tcpP75);
    b.sslP75 = Math.round(n.sslP75);
    b.contentDownloadP75 = Math.round(n.responseP75);
    b.domParseP75 = Math.round(n.domParseP75);
    b.resourceLoadP75 = Math.round(n.resourceLoadP75);
    if (n.sampleCount > b.sampleCount) b.sampleCount = n.sampleCount;
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

function buildFmpPages(rows: readonly FmpPageAggregateRow[]): FmpPageDto[] {
  return rows.map((r) => ({
    url: r.path,
    sampleCount: r.sampleCount,
    fmpAvgMs: Math.round(r.fmpAvgMs),
    fullyLoadedAvgMs: Math.round(r.fullyLoadedAvgMs),
    within3sRatio: Math.round(r.within3sRatio * 10000) / 10000, // 保留 4 位小数
  }));
}

/** 维度行：按样本数计算占比（0~100，保留 2 位小数） */
function buildDimensionRows(
  rows: readonly DimensionAggregateRow[],
): DimensionRowDto[] {
  const total = rows.reduce((acc, r) => acc + r.sampleCount, 0);
  if (total === 0) return [];
  return rows.map((r) => ({
    value: r.value || "unknown",
    sampleCount: r.sampleCount,
    sharePercent: Math.round((r.sampleCount / total) * 10000) / 100,
    fmpAvgMs: Math.round(r.fmpAvgMs),
  }));
}
