/**
 * 异常大盘数据契约（对齐 ADR-0016 §3 响应 DTO）
 *
 * UI 层类型独立于 server DTO；后端契约稳定后再抽入 packages/shared。
 */

import type { OverviewSource } from "./performance";

export type ErrorSubType =
  | "js"
  | "promise"
  | "resource"
  | "framework"
  | "white_screen";
export type DeltaDirection = "up" | "down" | "flat";

export interface ErrorSummary {
  readonly totalEvents: number;
  readonly impactedSessions: number;
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
}

export interface ErrorSubTypeRatio {
  readonly subType: ErrorSubType;
  readonly count: number;
  readonly ratio: number;
}

export interface ErrorTrendBucket {
  readonly hour: string;
  readonly total: number;
  readonly js: number;
  readonly promise: number;
  readonly resource: number;
  readonly framework: number;
  readonly whiteScreen: number;
}

export interface ErrorTopGroup {
  readonly subType: ErrorSubType;
  readonly messageHead: string;
  readonly count: number;
  readonly impactedSessions: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly sampleUrl: string;
}

export interface ErrorOverview {
  readonly summary: ErrorSummary;
  readonly bySubType: readonly ErrorSubTypeRatio[];
  readonly trend: readonly ErrorTrendBucket[];
  readonly topGroups: readonly ErrorTopGroup[];
}

export interface ErrorOverviewResult {
  readonly source: OverviewSource;
  readonly data: ErrorOverview;
}

/**
 * 获取异常大盘总览
 *
 * 依据 ADR-0016 §3：
 * - 成功 + totalEvents>0 → `source: "live"`
 * - 成功 + totalEvents=0 → `source: "empty"`
 * - 5xx / fetch 抛错 / JSON 解析失败 → `source: "error"`，降级为 emptyErrorOverview
 */
export async function getErrorOverview(): Promise<ErrorOverviewResult> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const projectId =
    process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "demo";

  const url = `${baseUrl}/dashboard/v1/errors/overview?projectId=${encodeURIComponent(
    projectId,
  )}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error(
        `[errors] ${response.status} ${response.statusText} @ ${url}`,
      );
      return { source: "error", data: emptyErrorOverview() };
    }
    const json = (await response.json()) as { data?: ErrorOverview };
    const data = json.data ?? emptyErrorOverview();
    const hasEvents = data.summary.totalEvents > 0;
    return { source: hasEvents ? "live" : "empty", data };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[errors] fetch failed @ ${url} —`,
      (err as Error).message,
    );
    return { source: "error", data: emptyErrorOverview() };
  }
}

/**
 * 空态占位：summary 全 0 + bySubType 5 占位 + trend/topGroups 空数组
 * 与 server 的 空数据返回形状保持一致
 */
export function emptyErrorOverview(): ErrorOverview {
  const subs: readonly ErrorSubType[] = [
    "js",
    "promise",
    "resource",
    "framework",
    "white_screen",
  ];
  return {
    summary: {
      totalEvents: 0,
      impactedSessions: 0,
      deltaPercent: 0,
      deltaDirection: "flat",
    },
    bySubType: subs.map((subType) => ({ subType, count: 0, ratio: 0 })),
    trend: [],
    topGroups: [],
  };
}
