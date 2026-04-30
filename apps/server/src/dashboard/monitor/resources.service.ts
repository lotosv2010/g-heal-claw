import { Injectable } from "@nestjs/common";
import {
  ResourcesService,
  type CategoryBucketRow,
  type FailingHostRow,
  type ResourceSummaryRow,
  type ResourceTrendRow,
  type ResourceWindowParams,
  type SlowResourceRow,
} from "../../modules/resources/resources.service.js";
import type {
  DeltaDirection,
  ResourceCategoryBucket,
  ResourcesCategoryBucketDto,
  ResourcesFailingHostDto,
  ResourcesOverviewDto,
  ResourcesOverviewQuery,
  ResourcesSummaryDeltaDto,
  ResourcesSummaryDto,
  ResourcesTopSlowDto,
  ResourcesTrendBucketDto,
} from "../dto/resources-overview.dto.js";

/**
 * Dashboard Resources 大盘装配层（ADR-0022 §4 / TM.1.B.4）
 *
 * 策略：
 *  - 两次窗口聚合 summary → 环比（总样本 % + 失败率差绝对值）
 *  - categoryBuckets 透传 ResourcesService（已在 Service 端补 6 占位）
 *  - trend / topSlow / topFailingHosts 透传
 */
@Injectable()
export class DashboardResourcesService {
  public constructor(
    private readonly resourceMonitor: ResourcesService,
  ) {}

  public async getOverview(
    query: ResourcesOverviewQuery,
  ): Promise<ResourcesOverviewDto> {
    const { projectId, windowHours, limitSlow, limitHosts } = query;
    const now = Date.now();
    const windowMs = windowHours * 3600_000;

    const current: ResourceWindowParams = {
      projectId,
      sinceMs: now - windowMs,
      untilMs: now,
    };
    const previous: ResourceWindowParams = {
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
      failingHostRows,
    ] = await Promise.all([
      this.resourceMonitor.aggregateSummary(current),
      this.resourceMonitor.aggregateSummary(previous),
      this.resourceMonitor.aggregateCategoryBuckets(current),
      this.resourceMonitor.aggregateTrend(current),
      this.resourceMonitor.aggregateSlowResources(current, limitSlow),
      this.resourceMonitor.aggregateFailingHosts(current, limitHosts),
    ]);

    return {
      summary: buildSummary(summaryCurrent, summaryPrevious),
      categoryBuckets: buildCategoryBuckets(bucketRows),
      trend: buildTrend(trendRows),
      topSlow: buildTopSlow(slowRows),
      topFailingHosts: buildFailingHosts(failingHostRows),
    };
  }
}

// ------- Summary -------

function buildSummary(
  current: ResourceSummaryRow,
  previous: ResourceSummaryRow,
): ResourcesSummaryDto {
  const failureRatio =
    current.totalRequests > 0
      ? round4(current.failedCount / current.totalRequests)
      : 0;
  const slowRatio =
    current.totalRequests > 0
      ? round4(current.slowCount / current.totalRequests)
      : 0;
  return {
    totalRequests: current.totalRequests,
    failedCount: current.failedCount,
    slowCount: current.slowCount,
    p75DurationMs: round2(current.p75DurationMs),
    totalTransferBytes: current.totalTransferBytes,
    failureRatio,
    slowRatio,
    delta: buildDelta(current, previous),
  };
}

function buildDelta(
  current: ResourceSummaryRow,
  previous: ResourceSummaryRow,
): ResourcesSummaryDeltaDto {
  const totalDelta = computePercentDelta(
    current.totalRequests,
    previous.totalRequests,
  );

  const curFail =
    current.totalRequests > 0
      ? current.failedCount / current.totalRequests
      : 0;
  const prevFail =
    previous.totalRequests > 0
      ? previous.failedCount / previous.totalRequests
      : 0;
  const failureDelta = computeRatioDelta(curFail, prevFail);

  return {
    totalRequests: totalDelta.deltaPercent,
    totalRequestsDirection: totalDelta.deltaDirection,
    failureRatio: failureDelta.deltaValue,
    failureRatioDirection: failureDelta.deltaDirection,
  };
}

function computePercentDelta(
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

function computeRatioDelta(
  current: number,
  previous: number,
): { deltaValue: number; deltaDirection: DeltaDirection } {
  const diff = current - previous;
  const rounded = round4(Math.abs(diff));
  if (rounded < 0.0001) {
    return { deltaValue: 0, deltaDirection: "flat" };
  }
  return {
    deltaValue: rounded,
    deltaDirection: diff > 0 ? "up" : "down",
  };
}

// ------- 分桶 / 趋势 / Top -------

function buildCategoryBuckets(
  rows: readonly CategoryBucketRow[],
): ResourcesCategoryBucketDto[] {
  return rows.map((r) => ({
    category: r.category as ResourceCategoryBucket,
    count: r.count,
    failedCount: r.failedCount,
    slowCount: r.slowCount,
    avgDurationMs: round2(r.avgDurationMs),
  }));
}

function buildTrend(
  rows: readonly ResourceTrendRow[],
): ResourcesTrendBucketDto[] {
  return rows.map((r) => ({
    hour: r.hour,
    count: r.count,
    failedCount: r.failedCount,
    slowCount: r.slowCount,
    avgDurationMs: round2(r.avgDurationMs),
  }));
}

function buildTopSlow(
  rows: readonly SlowResourceRow[],
): ResourcesTopSlowDto[] {
  return rows.map((r) => ({
    category: r.category as ResourceCategoryBucket,
    host: r.host,
    url: r.url,
    sampleCount: r.sampleCount,
    p75DurationMs: round2(r.p75DurationMs),
    failureRatio: round4(r.failureRatio),
  }));
}

function buildFailingHosts(
  rows: readonly FailingHostRow[],
): ResourcesFailingHostDto[] {
  return rows.map((r) => ({
    host: r.host,
    totalRequests: r.totalRequests,
    failedCount: r.failedCount,
    failureRatio: round4(r.failureRatio),
  }));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
