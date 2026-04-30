import { Injectable } from "@nestjs/common";
import {
  ApiService,
  type ApiSummaryRow,
  type ApiWindowParams,
  type DimensionRow,
  type ErrorStatusRow,
  type StatusBucketRow,
  type TopPageRow,
  type TopRequestRow,
} from "../../modules/api/api.service.js";
import type {
  ApiDimensionRowDto,
  ApiDimensionsDto,
  ApiOverviewDto,
  ApiOverviewQuery,
  ApiStatusBucketDto,
  ApiSummaryDto,
  ApiTopErrorStatusDto,
  ApiTopPageDto,
  ApiTopRequestDto,
  ApiTopSlowDto,
  ApiTrendBucketDto,
  DeltaDirection,
  StatusBucket,
} from "../dto/api-overview.dto.js";

/**
 * Dashboard API 大盘装配层（ADR-0020 §4.2 / TM.1.A.4）
 *
 * 策略与 DashboardErrorsService 对齐：
 *  - 两次窗口聚合 → summary 环比
 *  - 状态码桶固定 5 占位（0/2xx/3xx/4xx/5xx），空窗口返回零填充
 *  - trend 透传 ApiService.aggregateTrend
 *  - topSlow 透传 ApiService.aggregateSlowApis
 */
@Injectable()
export class DashboardApiService {
  public constructor(private readonly apiMonitor: ApiService) {}

  public async getOverview(query: ApiOverviewQuery): Promise<ApiOverviewDto> {
    const {
      projectId,
      windowHours,
      limitSlow,
      limitTop,
      limitPages,
      limitErrorStatus,
      limitDimension,
    } = query;
    const now = Date.now();
    const windowMs = windowHours * 3600_000;

    const current: ApiWindowParams = {
      projectId,
      sinceMs: now - windowMs,
      untilMs: now,
    };
    const previous: ApiWindowParams = {
      projectId,
      sinceMs: now - 2 * windowMs,
      untilMs: now - windowMs,
    };

    const [
      summaryCurrent,
      summaryPrevious,
      bucketRows,
      trendRows,
      slowRows,
      topRequestRows,
      topPageRows,
      errorStatusRows,
      dimBrowser,
      dimOs,
      dimPlatform,
    ] = await Promise.all([
      this.apiMonitor.aggregateSummary(current),
      this.apiMonitor.aggregateSummary(previous),
      this.apiMonitor.aggregateStatusBuckets(current),
      this.apiMonitor.aggregateTrend(current),
      this.apiMonitor.aggregateSlowApis(current, limitSlow),
      this.apiMonitor.aggregateTopRequests(current, limitTop),
      this.apiMonitor.aggregateTopPages(current, limitPages),
      this.apiMonitor.aggregateErrorStatus(current, limitErrorStatus),
      this.apiMonitor.aggregateDimension(current, "browser", limitDimension),
      this.apiMonitor.aggregateDimension(current, "os", limitDimension),
      this.apiMonitor.aggregateDimension(
        current,
        "device_type",
        limitDimension,
      ),
    ]);

    const summary = buildSummary(summaryCurrent, summaryPrevious);
    const statusBuckets = buildStatusBuckets(
      bucketRows,
      summary.totalRequests,
    );
    const trend = buildTrend(trendRows);
    const topSlow = buildTopSlow(slowRows);
    const topRequests = buildTopRequests(topRequestRows);
    const topPages = buildTopPages(topPageRows);
    const topErrorStatus = buildTopErrorStatus(errorStatusRows);
    const dimensions: ApiDimensionsDto = {
      browser: buildDimensionRows(dimBrowser),
      os: buildDimensionRows(dimOs),
      platform: buildDimensionRows(dimPlatform),
    };

    return {
      summary,
      statusBuckets,
      trend,
      topSlow,
      topRequests,
      topPages,
      topErrorStatus,
      dimensions,
    };
  }
}

function buildDimensionRows(
  rows: readonly DimensionRow[],
): ApiDimensionRowDto[] {
  return rows.map((r) => ({
    value: r.value,
    sampleCount: r.sampleCount,
    sharePercent: round2(r.sharePercent),
    avgDurationMs: round2(r.avgDurationMs),
    failureRatio: round4(r.failureRatio),
  }));
}

// ------- Summary -------

function buildSummary(
  current: ApiSummaryRow,
  previous: ApiSummaryRow,
): ApiSummaryDto {
  const { deltaPercent, deltaDirection } = computeDelta(
    current.totalRequests,
    previous.totalRequests,
  );
  const slowRatio =
    current.totalRequests > 0
      ? round4(current.slowCount / current.totalRequests)
      : 0;
  const failedRatio =
    current.totalRequests > 0
      ? round4(current.failedCount / current.totalRequests)
      : 0;
  return {
    totalRequests: current.totalRequests,
    slowCount: current.slowCount,
    failedCount: current.failedCount,
    p75DurationMs: current.p75DurationMs,
    slowRatio,
    failedRatio,
    deltaPercent,
    deltaDirection,
  };
}

function computeDelta(
  current: number,
  previous: number,
): { deltaPercent: number; deltaDirection: DeltaDirection } {
  if (previous === 0 || current === 0) {
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

// ------- 状态码桶 -------

const STATUS_BUCKET_ORDER: readonly StatusBucket[] = [
  "2xx",
  "3xx",
  "4xx",
  "5xx",
  "0",
];

function buildStatusBuckets(
  rows: readonly StatusBucketRow[],
  total: number,
): ApiStatusBucketDto[] {
  const map = new Map<string, number>(rows.map((r) => [r.bucket, r.count]));
  return STATUS_BUCKET_ORDER.map((bucket) => {
    const count = map.get(bucket) ?? 0;
    const ratio = total > 0 ? round4(count / total) : 0;
    return { bucket, count, ratio };
  });
}

// ------- trend / topSlow（透传） -------

function buildTrend(
  rows: readonly {
    readonly hour: string;
    readonly count: number;
    readonly slowCount: number;
    readonly failedCount: number;
    readonly avgDurationMs: number;
    readonly successRatio: number;
  }[],
): ApiTrendBucketDto[] {
  return rows.map((r) => ({
    hour: r.hour,
    count: r.count,
    slowCount: r.slowCount,
    failedCount: r.failedCount,
    avgDurationMs: round2(r.avgDurationMs),
    successRatio: round4(r.successRatio),
  }));
}

function buildTopSlow(
  rows: readonly {
    readonly method: string;
    readonly host: string;
    readonly pathTemplate: string;
    readonly sampleCount: number;
    readonly p75DurationMs: number;
    readonly failureRatio: number;
  }[],
): ApiTopSlowDto[] {
  return rows.map((r) => ({
    method: r.method,
    host: r.host,
    pathTemplate: r.pathTemplate,
    sampleCount: r.sampleCount,
    p75DurationMs: r.p75DurationMs,
    failureRatio: round4(r.failureRatio),
  }));
}

function buildTopRequests(
  rows: readonly TopRequestRow[],
): ApiTopRequestDto[] {
  return rows.map((r) => ({
    method: r.method,
    host: r.host,
    pathTemplate: r.pathTemplate,
    sampleCount: r.sampleCount,
    avgDurationMs: round2(r.avgDurationMs),
    failureRatio: round4(r.failureRatio),
  }));
}

function buildTopPages(rows: readonly TopPageRow[]): ApiTopPageDto[] {
  return rows.map((r) => ({
    pagePath: r.pagePath,
    requestCount: r.requestCount,
    avgDurationMs: round2(r.avgDurationMs),
    failedCount: r.failedCount,
    failureRatio: round4(r.failureRatio),
  }));
}

function buildTopErrorStatus(
  rows: readonly ErrorStatusRow[],
): ApiTopErrorStatusDto[] {
  return rows.map((r) => ({
    status: r.status,
    count: r.count,
    ratio: round4(r.ratio),
  }));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
