import { Injectable } from "@nestjs/common";
import {
  VisitsService,
  type TopPageRow,
  type TopReferrerRow,
  type VisitsSummaryRow,
  type VisitsTrendRow,
  type VisitsWindowParams,
} from "../../modules/visits/visits.service.js";
import type {
  DeltaDirection,
  VisitsOverviewDto,
  VisitsOverviewQuery,
  VisitsSummaryDto,
  VisitsTopPageDto,
  VisitsTopReferrerDto,
  VisitsTrendBucketDto,
} from "../dto/visits-overview.dto.js";

/**
 * Dashboard Visits 大盘装配层（ADR-0020 Tier 2.A）
 *
 * 策略与 DashboardApiService 对齐：
 *  - 两次窗口聚合 → summary 环比（按 PV）
 *  - trend / topPages / topReferrers 透传 VisitsService 聚合结果
 */
@Injectable()
export class DashboardVisitsService {
  public constructor(private readonly visits: VisitsService) {}

  public async getOverview(
    query: VisitsOverviewQuery,
  ): Promise<VisitsOverviewDto> {
    const { projectId, windowHours, limitPages, limitReferrers } = query;
    const now = Date.now();
    const windowMs = windowHours * 3600_000;
    const granularity = windowHours > 24 ? "day" as const : "hour" as const;
    const environment = query.environment;
    const current: VisitsWindowParams = {
      projectId,
      sinceMs: now - windowMs,
      untilMs: now,
      granularity,
      environment,
    };
    const previous: VisitsWindowParams = {
      projectId,
      sinceMs: now - 2 * windowMs,
      untilMs: now - windowMs,
      granularity,
      environment,
    };

    const [summaryCurrent, summaryPrevious, trendRows, topPageRows, topRefRows] =
      await Promise.all([
        this.visits.aggregateSummary(current),
        this.visits.aggregateSummary(previous),
        this.visits.aggregateTrend(current),
        this.visits.aggregateTopPages(current, limitPages),
        this.visits.aggregateTopReferrers(current, limitReferrers),
      ]);

    return {
      summary: buildSummary(summaryCurrent, summaryPrevious),
      trend: buildTrend(trendRows),
      topPages: buildTopPages(topPageRows),
      topReferrers: buildTopReferrers(topRefRows),
    };
  }
}

function buildSummary(
  current: VisitsSummaryRow,
  previous: VisitsSummaryRow,
): VisitsSummaryDto {
  const { deltaPercent, deltaDirection } = computeDelta(current.pv, previous.pv);
  return {
    pv: current.pv,
    uv: current.uv,
    spaNavCount: current.spaNavCount,
    reloadCount: current.reloadCount,
    spaNavRatio: current.pv > 0 ? round4(current.spaNavCount / current.pv) : 0,
    reloadRatio: current.pv > 0 ? round4(current.reloadCount / current.pv) : 0,
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

function buildTrend(rows: readonly VisitsTrendRow[]): VisitsTrendBucketDto[] {
  return rows.map((r) => ({ hour: r.hour, pv: r.pv, uv: r.uv }));
}

function buildTopPages(rows: readonly TopPageRow[]): VisitsTopPageDto[] {
  return rows.map((r) => ({
    path: r.path,
    pv: r.pv,
    uv: r.uv,
    sharePercent: round2(r.sharePercent),
  }));
}

function buildTopReferrers(
  rows: readonly TopReferrerRow[],
): VisitsTopReferrerDto[] {
  return rows.map((r) => ({
    referrerHost: r.referrerHost,
    pv: r.pv,
    sharePercent: round2(r.sharePercent),
  }));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
