import { computeGranularity } from "../../shared/granularity.js";
import { Injectable } from "@nestjs/common";
import {
  TrackingService,
  type TrackSummaryRow,
  type TrackWindowParams,
  type TrackTypeBucketRow,
  type TrackTrendRow,
  type TopEventRow,
  type TopTrackPageRow,
} from "../../modules/tracking/tracking.service.js";
import type {
  DeltaDirection,
  TrackingOverviewDto,
  TrackingOverviewQuery,
  TrackSummaryDto,
  TrackTopEventDto,
  TrackTopPageDto,
  TrackTrendBucketDto,
  TrackTypeBucket,
  TrackTypeBucketDto,
} from "../dto/tracking-overview.dto.js";

/**
 * Dashboard 埋点大盘装配层（P0-3 §2）
 *
 * 策略与 DashboardApiService 对齐：
 *  - 两次窗口聚合 → summary 环比
 *  - typeBuckets 固定 4 占位（code / click / expose / submit）
 *  - trend / topEvents / topPages 透传 TrackingService
 */
@Injectable()
export class DashboardTrackingService {
  public constructor(private readonly tracking: TrackingService) {}

  public async getOverview(
    query: TrackingOverviewQuery,
  ): Promise<TrackingOverviewDto> {
    const { projectId, windowHours, limitEvents, limitPages } = query;
    const now = Date.now();
    const windowMs = windowHours * 3600_000;

    const granularity = computeGranularity(windowHours);
    const environment = query.environment;
    const current: TrackWindowParams = {
      projectId,
      sinceMs: now - windowMs,
      untilMs: now,
      granularity,
      environment,
    };
    const previous: TrackWindowParams = {
      projectId,
      sinceMs: now - 2 * windowMs,
      untilMs: now - windowMs,
      granularity,
      environment,
    };

    const [
      summaryCurrent,
      summaryPrevious,
      bucketRows,
      trendRows,
      topEventRows,
      topPageRows,
    ] = await Promise.all([
      this.tracking.aggregateSummary(current),
      this.tracking.aggregateSummary(previous),
      this.tracking.aggregateTypeBuckets(current),
      this.tracking.aggregateTrend(current),
      this.tracking.aggregateTopEvents(current, limitEvents),
      this.tracking.aggregateTopPages(current, limitPages),
    ]);

    const summary = buildSummary(summaryCurrent, summaryPrevious);
    const typeBuckets = buildTypeBuckets(bucketRows, summary.totalEvents);
    const trend = buildTrend(trendRows);
    const topEvents = buildTopEvents(topEventRows);
    const topPages = buildTopPages(topPageRows);

    return {
      summary,
      typeBuckets,
      trend,
      topEvents,
      topPages,
    };
  }
}

// ------- Summary -------

function buildSummary(
  current: TrackSummaryRow,
  previous: TrackSummaryRow,
): TrackSummaryDto {
  const { deltaPercent, deltaDirection } = computeDelta(
    current.totalEvents,
    previous.totalEvents,
  );
  const eventsPerSession =
    current.uniqueSessions > 0
      ? round2(current.totalEvents / current.uniqueSessions)
      : 0;
  return {
    totalEvents: current.totalEvents,
    uniqueUsers: current.uniqueUsers,
    uniqueSessions: current.uniqueSessions,
    uniqueEventNames: current.uniqueEventNames,
    eventsPerSession,
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

// ------- typeBuckets -------

const TYPE_BUCKET_ORDER: readonly TrackTypeBucket[] = [
  "click",
  "expose",
  "submit",
  "code",
];

function buildTypeBuckets(
  rows: readonly TrackTypeBucketRow[],
  total: number,
): TrackTypeBucketDto[] {
  const map = new Map<string, number>(rows.map((r) => [r.bucket, r.count]));
  return TYPE_BUCKET_ORDER.map((bucket) => {
    const count = map.get(bucket) ?? 0;
    const ratio = total > 0 ? round4(count / total) : 0;
    return { bucket, count, ratio };
  });
}

// ------- trend / top* -------

function buildTrend(rows: readonly TrackTrendRow[]): TrackTrendBucketDto[] {
  return rows.map((r) => ({
    hour: r.hour,
    count: r.count,
    uniqueUsers: r.uniqueUsers,
  }));
}

function buildTopEvents(rows: readonly TopEventRow[]): TrackTopEventDto[] {
  return rows.map((r) => ({
    eventName: r.eventName,
    trackType: r.trackType,
    count: r.count,
    uniqueUsers: r.uniqueUsers,
    sharePercent: round2(r.sharePercent),
  }));
}

function buildTopPages(rows: readonly TopTrackPageRow[]): TrackTopPageDto[] {
  return rows.map((r) => ({
    pagePath: r.pagePath,
    count: r.count,
    uniqueUsers: r.uniqueUsers,
  }));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
