import { Injectable } from "@nestjs/common";
import {
  TrackingService,
  type ExposureSummaryRow,
  type TopExposureSelectorRow,
  type TopTrackPageRow,
  type TrackTrendRow,
  type TrackWindowParams,
} from "../../modules/tracking/tracking.service.js";
import type {
  DeltaDirection,
  ExposureOverviewDto,
  ExposureOverviewQuery,
  ExposureSummaryDto,
  ExposureTopPageDto,
  ExposureTopSelectorDto,
  ExposureTrendBucketDto,
} from "../dto/exposure-overview.dto.js";

/**
 * Dashboard 曝光大盘装配层（ADR-0024）
 *
 * 与 DashboardTrackingService 同构：
 *  - 两次窗口聚合 → summary 环比
 *  - trend / topSelectors / topPages 透传 TrackingService 的 expose 专用方法
 */
@Injectable()
export class DashboardExposureService {
  public constructor(private readonly tracking: TrackingService) {}

  public async getOverview(
    query: ExposureOverviewQuery,
  ): Promise<ExposureOverviewDto> {
    const { projectId, windowHours, limitSelectors, limitPages } = query;
    const now = Date.now();
    const windowMs = windowHours * 3600_000;

    const current: TrackWindowParams = {
      projectId,
      sinceMs: now - windowMs,
      untilMs: now,
    };
    const previous: TrackWindowParams = {
      projectId,
      sinceMs: now - 2 * windowMs,
      untilMs: now - windowMs,
    };

    const [
      summaryCurrent,
      summaryPrevious,
      trendRows,
      topSelectorRows,
      topPageRows,
    ] = await Promise.all([
      this.tracking.aggregateExposureSummary(current),
      this.tracking.aggregateExposureSummary(previous),
      this.tracking.aggregateExposureTrend(current),
      this.tracking.aggregateTopExposureSelectors(current, limitSelectors),
      this.tracking.aggregateTopExposurePages(current, limitPages),
    ]);

    const summary = buildSummary(summaryCurrent, summaryPrevious);
    const trend = buildTrend(trendRows);
    const topSelectors = buildTopSelectors(topSelectorRows);
    const topPages = buildTopPages(topPageRows);

    return { summary, trend, topSelectors, topPages };
  }
}

// ------- Summary -------

function buildSummary(
  current: ExposureSummaryRow,
  previous: ExposureSummaryRow,
): ExposureSummaryDto {
  const { deltaPercent, deltaDirection } = computeDelta(
    current.totalExposures,
    previous.totalExposures,
  );
  const exposuresPerUser =
    current.uniqueUsers > 0
      ? round2(current.totalExposures / current.uniqueUsers)
      : 0;
  return {
    totalExposures: current.totalExposures,
    uniqueSelectors: current.uniqueSelectors,
    uniquePages: current.uniquePages,
    uniqueUsers: current.uniqueUsers,
    exposuresPerUser,
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

// ------- trend / top* -------

function buildTrend(rows: readonly TrackTrendRow[]): ExposureTrendBucketDto[] {
  return rows.map((r) => ({
    hour: r.hour,
    count: r.count,
    uniqueUsers: r.uniqueUsers,
  }));
}

function buildTopSelectors(
  rows: readonly TopExposureSelectorRow[],
): ExposureTopSelectorDto[] {
  return rows.map((r) => ({
    selector: r.selector,
    sampleText: r.sampleText,
    count: r.count,
    uniqueUsers: r.uniqueUsers,
    uniquePages: r.uniquePages,
    sharePercent: round2(r.sharePercent),
  }));
}

function buildTopPages(rows: readonly TopTrackPageRow[]): ExposureTopPageDto[] {
  return rows.map((r) => ({
    pagePath: r.pagePath,
    count: r.count,
    uniqueUsers: r.uniqueUsers,
  }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
