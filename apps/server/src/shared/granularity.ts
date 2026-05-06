/**
 * 时间粒度计算（全局唯一规则源）
 *
 * 规则：
 *  - windowHours ≤ 1（含 15m、1h）→ minute 级统计
 *  - windowHours ≤ 24 → hour 级统计
 *  - windowHours > 24（7d、30d、自定义）→ day 级统计
 */

import { sql, type SQL } from "drizzle-orm";

export type Granularity = "minute" | "hour" | "day";

export function computeGranularity(windowHours: number): Granularity {
  if (windowHours <= 1) return "minute";
  if (windowHours <= 24) return "hour";
  return "day";
}

/**
 * 根据粒度返回 SQL date_trunc 片段（供 aggregateTrend 系列函数复用）
 *
 * 用法：`SELECT ${truncSql(granularity)} AS hour, ...`
 */
export function truncSql(granularity: Granularity | undefined): SQL {
  switch (granularity) {
    case "day":
      return sql`date_trunc('day', to_timestamp(ts_ms / 1000.0))`;
    case "minute":
      return sql`date_trunc('minute', to_timestamp(ts_ms / 1000.0))`;
    default:
      return sql`date_trunc('hour', to_timestamp(ts_ms / 1000.0))`;
  }
}
