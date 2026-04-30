import { Injectable } from "@nestjs/common";
import {
  TrackingService,
  type FunnelStepRow,
} from "../../modules/tracking/tracking.service.js";
import type {
  FunnelOverviewDto,
  FunnelOverviewQuery,
  FunnelStepDto,
} from "../dto/tracking-funnel.dto.js";

/**
 * Dashboard 漏斗装配层（ADR-0027）
 *
 * 职责：
 *  - 将 stepWindowMinutes（API 单位）换算为 stepWindowMs 传给 TrackingService
 *  - 将 FunnelStepRow[] 计算为 FunnelStepDto[]（含 conversionFromPrev / conversionFromFirst）
 *  - 计算 totalEntered（= step 1 users）与 overallConversion
 *
 * 空窗口 / 首步 0：所有比例 0；末步 0：正常保留步长，比例为 0。
 */
@Injectable()
export class DashboardFunnelService {
  public constructor(private readonly tracking: TrackingService) {}

  public async getOverview(
    query: FunnelOverviewQuery,
  ): Promise<FunnelOverviewDto> {
    const { projectId, windowHours, stepWindowMinutes, steps } = query;
    const now = Date.now();
    const windowMs = windowHours * 3600_000;
    const stepWindowMs = stepWindowMinutes * 60_000;

    const rows = await this.tracking.aggregateFunnel({
      projectId,
      sinceMs: now - windowMs,
      untilMs: now,
      steps,
      stepWindowMs,
    });

    const totalEntered = rows[0]?.users ?? 0;
    const stepsDto = buildSteps(rows, totalEntered);
    const lastUsers = rows.length > 0 ? rows[rows.length - 1]!.users : 0;
    const overallConversion =
      totalEntered > 0 ? round4(lastUsers / totalEntered) : 0;

    return {
      windowHours,
      stepWindowMinutes,
      totalEntered,
      steps: stepsDto,
      overallConversion,
    };
  }
}

function buildSteps(
  rows: readonly FunnelStepRow[],
  totalEntered: number,
): FunnelStepDto[] {
  return rows.map((row, i) => {
    const prevUsers = i === 0 ? totalEntered : rows[i - 1]!.users;
    const conversionFromPrev =
      i === 0
        ? totalEntered > 0
          ? 1
          : 0
        : prevUsers > 0
          ? round4(row.users / prevUsers)
          : 0;
    const conversionFromFirst =
      totalEntered > 0 ? round4(row.users / totalEntered) : 0;
    return {
      index: row.index,
      eventName: row.eventName,
      users: row.users,
      conversionFromPrev,
      conversionFromFirst,
    };
  });
}

/** 保留 4 位小数（ADR-0027 §4 契约） */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
