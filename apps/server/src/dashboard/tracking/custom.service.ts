import { computeGranularity } from "../../shared/granularity.js";
import { Injectable } from "@nestjs/common";
import {
  CustomEventsService,
  type CustomEventsSummaryRow,
  type CustomEventTopRow,
  type CustomEventTrendRow,
  type CustomEventTopPageRow,
  type CustomWindowParams,
} from "../../modules/custom/custom-events.service.js";
import {
  CustomMetricsService,
  type CustomMetricsSummaryRow,
  type CustomMetricTopRow,
  type CustomMetricTrendRow,
} from "../../modules/custom/custom-metrics.service.js";
import type {
  CustomEventTopDto,
  CustomEventTrendBucketDto,
  CustomMetricTopDto,
  CustomMetricTrendBucketDto,
  CustomOverviewDto,
  CustomOverviewQuery,
  CustomSummaryDeltaDto,
  CustomSummaryDto,
  CustomTopPageDto,
  DeltaDirection,
} from "../dto/custom-overview.dto.js";

/**
 * Dashboard Custom 大盘装配层（ADR-0023 §4 / TM.1.C.4）
 *
 * 并行聚合 eventsSummary / metricsSummary（双窗口环比）+ topN + trend + topPages，
 * 透传两个领域 Service；单位换算与四舍五入统一在本层完成。
 */
@Injectable()
export class DashboardCustomService {
  public constructor(
    private readonly events: CustomEventsService,
    private readonly metrics: CustomMetricsService,
  ) {}

  public async getOverview(
    query: CustomOverviewQuery,
  ): Promise<CustomOverviewDto> {
    const { projectId, windowHours, limitEvents, limitMetrics, limitPages } =
      query;
    const now = Date.now();
    const windowMs = windowHours * 3600_000;

    const granularity = computeGranularity(windowHours);
    const environment = query.environment;
    const current: CustomWindowParams = {
      projectId,
      sinceMs: now - windowMs,
      untilMs: now,
      granularity,
      environment,
    };
    const previous: CustomWindowParams = {
      projectId,
      sinceMs: now - 2 * windowMs,
      untilMs: now - windowMs,
      granularity,
      environment,
    };

    const [
      eventsSummaryCur,
      eventsSummaryPrev,
      metricsSummaryCur,
      metricsSummaryPrev,
      eventsTop,
      metricsTop,
      eventsTrend,
      metricsTrend,
      topPages,
    ] = await Promise.all([
      this.events.aggregateSummary(current),
      this.events.aggregateSummary(previous),
      this.metrics.aggregateSummary(current),
      this.metrics.aggregateSummary(previous),
      this.events.aggregateTopEvents(current, limitEvents),
      this.metrics.aggregateTopMetrics(current, limitMetrics),
      this.events.aggregateTrend(current),
      this.metrics.aggregateTrend(current),
      this.events.aggregateTopPages(current, limitPages),
    ]);

    return {
      summary: buildSummary(
        eventsSummaryCur,
        eventsSummaryPrev,
        metricsSummaryCur,
        metricsSummaryPrev,
      ),
      eventsTopN: buildEventsTop(eventsTop),
      metricsTopN: buildMetricsTop(metricsTop),
      eventsTrend: buildEventsTrend(eventsTrend),
      metricsTrend: buildMetricsTrend(metricsTrend),
      topPages: buildTopPages(topPages),
    };
  }
}

// ------- Summary -------

function buildSummary(
  eventsCur: CustomEventsSummaryRow,
  eventsPrev: CustomEventsSummaryRow,
  metricsCur: CustomMetricsSummaryRow,
  metricsPrev: CustomMetricsSummaryRow,
): CustomSummaryDto {
  return {
    totalEvents: eventsCur.totalEvents,
    distinctEventNames: eventsCur.distinctNames,
    topEventName: eventsCur.topEventName,
    avgEventsPerSession: round2(eventsCur.avgPerSession),
    totalSamples: metricsCur.totalSamples,
    distinctMetricNames: metricsCur.distinctNames,
    globalP75DurationMs: round2(metricsCur.globalP75),
    globalP95DurationMs: round2(metricsCur.globalP95),
    delta: buildDelta(eventsCur, eventsPrev, metricsCur, metricsPrev),
  };
}

function buildDelta(
  eventsCur: CustomEventsSummaryRow,
  eventsPrev: CustomEventsSummaryRow,
  metricsCur: CustomMetricsSummaryRow,
  metricsPrev: CustomMetricsSummaryRow,
): CustomSummaryDeltaDto {
  const eventsDelta = computePercentDelta(
    eventsCur.totalEvents,
    eventsPrev.totalEvents,
  );
  const samplesDelta = computePercentDelta(
    metricsCur.totalSamples,
    metricsPrev.totalSamples,
  );
  return {
    totalEvents: eventsDelta.deltaPercent,
    totalEventsDirection: eventsDelta.deltaDirection,
    totalSamples: samplesDelta.deltaPercent,
    totalSamplesDirection: samplesDelta.deltaDirection,
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

// ------- Top / Trend -------

function buildEventsTop(
  rows: readonly CustomEventTopRow[],
): CustomEventTopDto[] {
  return rows.map((r) => ({
    name: r.name,
    count: r.count,
    lastSeenMs: r.lastSeenMs,
  }));
}

function buildMetricsTop(
  rows: readonly CustomMetricTopRow[],
): CustomMetricTopDto[] {
  return rows.map((r) => ({
    name: r.name,
    count: r.count,
    p50DurationMs: round2(r.p50),
    p75DurationMs: round2(r.p75),
    p95DurationMs: round2(r.p95),
    avgDurationMs: round2(r.avgDurationMs),
  }));
}

function buildEventsTrend(
  rows: readonly CustomEventTrendRow[],
): CustomEventTrendBucketDto[] {
  return rows.map((r) => ({ hour: r.hour, count: r.count }));
}

function buildMetricsTrend(
  rows: readonly CustomMetricTrendRow[],
): CustomMetricTrendBucketDto[] {
  return rows.map((r) => ({
    hour: r.hour,
    count: r.count,
    avgDurationMs: round2(r.avgDurationMs),
  }));
}

function buildTopPages(
  rows: readonly CustomEventTopPageRow[],
): CustomTopPageDto[] {
  return rows.map((r) => ({ pagePath: r.pagePath, count: r.count }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
