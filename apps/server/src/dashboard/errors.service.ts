import { Injectable, Logger } from "@nestjs/common";
import {
  ErrorsService,
  type ErrorWindowParams,
  type SubTypeCountRow,
  type TrendRow,
  type TopGroupRow,
} from "../errors/errors.service.js";
import type {
  DeltaDirection,
  ErrorOverviewDto,
  ErrorSubType,
  ErrorSubTypeDto,
  ErrorSummaryDto,
  ErrorsOverviewQuery,
  ErrorTopGroupDto,
  ErrorTrendBucketDto,
} from "./dto/errors-overview.dto.js";

/**
 * Dashboard 异常大盘装配层（ADR-0016 §3）
 *
 * 与 DashboardPerformanceService 同构：
 * - 两次时间窗（当前 / 前一周期）聚合
 * - DB 行 → 面向前端的 DTO
 * - 空数据降级：subType 补齐 5 占位，trend/topGroups 返回空数组
 */
@Injectable()
export class DashboardErrorsService {
  private readonly logger = new Logger(DashboardErrorsService.name);

  public constructor(private readonly errors: ErrorsService) {}

  public async getOverview(
    query: ErrorsOverviewQuery,
  ): Promise<ErrorOverviewDto> {
    const { projectId, windowHours, limitGroups } = query;
    const now = Date.now();
    const windowMs = windowHours * 3600_000;

    const current: ErrorWindowParams = {
      projectId,
      sinceMs: now - windowMs,
      untilMs: now,
    };
    const previous: ErrorWindowParams = {
      projectId,
      sinceMs: now - 2 * windowMs,
      untilMs: now - windowMs,
    };

    const [summaryCurrent, summaryPrevious, bySubTypeRows, trendRows, topRows] =
      await Promise.all([
        this.errors.aggregateSummary(current),
        this.errors.aggregateSummary(previous),
        this.errors.aggregateBySubType(current),
        this.errors.aggregateTrend(current),
        this.errors.aggregateTopGroups(current, limitGroups),
      ]);

    const summary = buildSummary(summaryCurrent, summaryPrevious);
    const bySubType = buildBySubType(bySubTypeRows, summary.totalEvents);
    const trend = buildTrend(trendRows);
    const topGroups = buildTopGroups(topRows);

    return { summary, bySubType, trend, topGroups };
  }
}

// ------- Summary -------

function buildSummary(
  current: { totalEvents: number; impactedSessions: number },
  previous: { totalEvents: number; impactedSessions: number },
): ErrorSummaryDto {
  const { deltaPercent, deltaDirection } = computeDelta(
    current.totalEvents,
    previous.totalEvents,
  );
  return {
    totalEvents: current.totalEvents,
    impactedSessions: current.impactedSessions,
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

// ------- bySubType -------

const SUB_TYPE_ORDER: readonly ErrorSubType[] = [
  "js",
  "promise",
  "resource",
  "framework",
  "white_screen",
];

function buildBySubType(
  rows: readonly SubTypeCountRow[],
  total: number,
): ErrorSubTypeDto[] {
  const map = new Map<string, number>(rows.map((r) => [r.subType, r.count]));
  return SUB_TYPE_ORDER.map((st) => {
    const count = map.get(st) ?? 0;
    const ratio = total > 0 ? Math.round((count / total) * 10000) / 10000 : 0;
    return { subType: st, count, ratio };
  });
}

// ------- trend -------

function buildTrend(rows: readonly TrendRow[]): ErrorTrendBucketDto[] {
  if (rows.length === 0) return [];
  const byHour = new Map<
    string,
    {
      total: number;
      js: number;
      promise: number;
      resource: number;
      framework: number;
      whiteScreen: number;
    }
  >();
  for (const r of rows) {
    const current =
      byHour.get(r.hour) ??
      {
        total: 0,
        js: 0,
        promise: 0,
        resource: 0,
        framework: 0,
        whiteScreen: 0,
      };
    current.total += r.count;
    switch (r.subType) {
      case "js":
        current.js += r.count;
        break;
      case "promise":
        current.promise += r.count;
        break;
      case "resource":
        current.resource += r.count;
        break;
      case "framework":
        current.framework += r.count;
        break;
      case "white_screen":
        current.whiteScreen += r.count;
        break;
      default:
        // 未知 subType 只计入 total
        break;
    }
    byHour.set(r.hour, current);
  }
  return [...byHour.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([hour, v]) => ({ hour, ...v }));
}

// ------- topGroups -------

function buildTopGroups(rows: readonly TopGroupRow[]): ErrorTopGroupDto[] {
  return rows.map((r) => ({
    subType: normalizeSubType(r.subType),
    messageHead: r.messageHead,
    count: r.count,
    impactedSessions: r.impactedSessions,
    firstSeen: new Date(r.firstSeenMs).toISOString(),
    lastSeen: new Date(r.lastSeenMs).toISOString(),
    sampleUrl: r.samplePath,
  }));
}

function normalizeSubType(raw: string): ErrorSubType {
  return (SUB_TYPE_ORDER as readonly string[]).includes(raw)
    ? (raw as ErrorSubType)
    : "js";
}
