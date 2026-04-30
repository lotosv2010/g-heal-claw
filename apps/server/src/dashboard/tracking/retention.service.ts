import { Injectable, Logger } from "@nestjs/common";
import {
  VisitsService,
  type RetentionMatrixRow,
} from "../../modules/visits/visits.service.js";
import type {
  RetentionCohortDto,
  RetentionOverviewDto,
  RetentionOverviewQuery,
} from "../dto/tracking-retention.dto.js";

/**
 * Dashboard 用户留存装配层（ADR-0028）
 *
 * 职责：
 *  - 窗口归一：since/until 解析为毫秒；省略时以 now 为终点反推
 *  - 调用 `VisitsService.aggregateRetention` 拿到 cohort × day_offset 矩阵
 *  - 计算每 cohort 的 `retentionByDay`（day 0 = 1；长度 = returnDays + 1）
 *  - 计算跨 cohort 的 `averageByDay`（按 cohortSize 加权）
 *  - 三态 source：
 *      - rows 为空 → source=empty
 *      - aggregateRetention 抛错 → source=error（上层向前兼容，错误不 5xx）
 *      - 正常 → source=live
 */
@Injectable()
export class DashboardRetentionService {
  private readonly logger = new Logger(DashboardRetentionService.name);

  public constructor(private readonly visits: VisitsService) {}

  public async getOverview(
    query: RetentionOverviewQuery,
  ): Promise<RetentionOverviewDto> {
    const { projectId, cohortDays, returnDays, identity, since, until } =
      query;
    const now = Date.now();
    const untilMs = until ? Date.parse(until) : now;
    const sinceMs = since
      ? Date.parse(since)
      : untilMs - (cohortDays + returnDays) * 24 * 60 * 60 * 1000;

    const emptyShell: RetentionOverviewDto = {
      source: "empty",
      identity,
      cohortDays,
      returnDays,
      window: { sinceMs, untilMs },
      totalNewUsers: 0,
      averageByDay: zerosOfLength(returnDays + 1),
      cohorts: [],
    };

    let rows: readonly RetentionMatrixRow[];
    try {
      rows = await this.visits.aggregateRetention({
        projectId,
        sinceMs,
        untilMs,
        cohortDays,
        returnDays,
        identity,
      });
    } catch (err) {
      this.logger.warn(
        `留存聚合失败（返回 source=error）：${(err as Error).message}`,
      );
      return { ...emptyShell, source: "error" };
    }

    if (rows.length === 0) {
      return emptyShell;
    }

    const cohorts = buildCohorts(rows, returnDays);
    const totalNewUsers = cohorts.reduce((acc, c) => acc + c.cohortSize, 0);
    const averageByDay = buildAverageByDay(rows, returnDays);

    return {
      source: "live",
      identity,
      cohortDays,
      returnDays,
      window: { sinceMs, untilMs },
      totalNewUsers,
      averageByDay,
      cohorts,
    };
  }
}

/** 矩阵行 → 每 cohort 的 retentionByDay（长度 = returnDays + 1） */
function buildCohorts(
  rows: readonly RetentionMatrixRow[],
  returnDays: number,
): RetentionCohortDto[] {
  const byCohort = new Map<
    string,
    { cohortSize: number; retained: Map<number, number> }
  >();
  for (const r of rows) {
    const entry = byCohort.get(r.cohortDay) ?? {
      cohortSize: r.cohortSize,
      retained: new Map<number, number>(),
    };
    // cohortSize 对同 cohortDay 的所有行恒等，任一行即可
    entry.cohortSize = r.cohortSize;
    entry.retained.set(r.dayOffset, r.retained);
    byCohort.set(r.cohortDay, entry);
  }

  const cohorts: RetentionCohortDto[] = [];
  for (const [cohortDate, { cohortSize, retained }] of byCohort) {
    const series: number[] = [];
    for (let k = 0; k <= returnDays; k += 1) {
      const retainedK = retained.get(k) ?? 0;
      series.push(cohortSize > 0 ? round4(retainedK / cohortSize) : 0);
    }
    cohorts.push({
      cohortDate,
      cohortSize,
      retentionByDay: series,
    });
  }
  cohorts.sort((a, b) => (a.cohortDate < b.cohortDate ? -1 : 1));
  return cohorts;
}

/** 按 cohortSize 加权平均：averageByDay[k] = Σ retained(*, k) / Σ cohortSize(*) */
function buildAverageByDay(
  rows: readonly RetentionMatrixRow[],
  returnDays: number,
): number[] {
  const retainedSum: number[] = new Array(returnDays + 1).fill(0);
  const sizeSumByCohort = new Map<string, number>();
  for (const r of rows) {
    if (r.dayOffset >= 0 && r.dayOffset <= returnDays) {
      retainedSum[r.dayOffset] =
        (retainedSum[r.dayOffset] ?? 0) + r.retained;
    }
    // cohortSize 对同 cohortDay 恒等；去重累加
    sizeSumByCohort.set(r.cohortDay, r.cohortSize);
  }
  let totalSize = 0;
  for (const s of sizeSumByCohort.values()) totalSize += s;
  return retainedSum.map((sum) =>
    totalSize > 0 ? round4(sum / totalSize) : 0,
  );
}

function zerosOfLength(n: number): number[] {
  return new Array(Math.max(0, n)).fill(0);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
