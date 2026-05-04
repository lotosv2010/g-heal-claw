/**
 * 数据总览契约（对齐 ADR-0029）
 *
 * 消费 server `/dashboard/v1/overview/summary`：
 *  - 任一域失败 → 该域 source="error"，装配层已隔离
 *  - health.score=null → tone="unknown"（全域无样本），前端渲染引导页
 */

import type { OverviewSource } from "./performance";

export type HealthTone = "good" | "warn" | "destructive" | "unknown";
export type DeltaDirection = "up" | "down" | "flat";
export type DomainSource = OverviewSource;

export interface HealthComponent {
  readonly key: "errors" | "performance" | "api" | "resources";
  readonly deducted: number;
  readonly weight: number;
  readonly signal: number;
}

export interface HealthDto {
  readonly score: number | null;
  readonly tone: HealthTone;
  readonly components: readonly HealthComponent[];
}

export interface ErrorsSummaryDto {
  readonly totalEvents: number;
  readonly impactedSessions: number;
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
  readonly source: DomainSource;
}

export interface PerformanceSummaryDto {
  readonly lcpP75Ms: number;
  readonly inpP75Ms: number;
  readonly clsP75: number;
  readonly tone: HealthTone;
  readonly source: DomainSource;
}

export interface ApiSummaryDto {
  readonly totalRequests: number;
  readonly errorRate: number;
  readonly p75DurationMs: number;
  readonly source: DomainSource;
}

export interface ResourcesSummaryDto {
  readonly totalRequests: number;
  readonly failureRate: number;
  readonly slowCount: number;
  readonly source: DomainSource;
}

export interface VisitsSummaryDto {
  readonly pv: number;
  readonly uv: number;
  readonly spaRatio: number;
  readonly source: DomainSource;
}

export interface OverviewSummary {
  readonly health: HealthDto;
  readonly errors: ErrorsSummaryDto;
  readonly performance: PerformanceSummaryDto;
  readonly api: ApiSummaryDto;
  readonly resources: ResourcesSummaryDto;
  readonly visits: VisitsSummaryDto;
  readonly generatedAtMs: number;
  readonly windowHours: number;
}

export interface OverviewSummaryResult {
  readonly source: OverviewSource;
  readonly data: OverviewSummary;
}

export async function getOverviewSummary(): Promise<OverviewSummaryResult> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const projectId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "demo";
  const url = `${baseUrl}/dashboard/v1/overview/summary?projectId=${encodeURIComponent(
    projectId,
  )}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      console.error(
        `[overview-summary] ${response.status} ${response.statusText} @ ${url}`,
      );
      return { source: "error", data: emptySummary() };
    }
    const json = (await response.json()) as { data?: OverviewSummary };
    if (!json.data) return { source: "error", data: emptySummary() };
    // 整体 source：全域均 live → live；任一非 error → empty/live 混合时取 empty
    // 实现上我们只关心 SourceBadge 的顶层提示，细粒度以各域 source 字段为准
    const topSource: OverviewSource =
      json.data.health.tone === "unknown" ? "empty" : "live";
    return { source: topSource, data: json.data };
  } catch (err) {
    console.error(
      `[overview-summary] fetch failed @ ${url} —`,
      (err as Error).message,
    );
    return { source: "error", data: emptySummary() };
  }
}

export function emptySummary(): OverviewSummary {
  return {
    health: { score: null, tone: "unknown", components: [] },
    errors: {
      totalEvents: 0,
      impactedSessions: 0,
      deltaPercent: 0,
      deltaDirection: "flat",
      source: "empty",
    },
    performance: {
      lcpP75Ms: 0,
      inpP75Ms: 0,
      clsP75: 0,
      tone: "unknown",
      source: "empty",
    },
    api: {
      totalRequests: 0,
      errorRate: 0,
      p75DurationMs: 0,
      source: "empty",
    },
    resources: {
      totalRequests: 0,
      failureRate: 0,
      slowCount: 0,
      source: "empty",
    },
    visits: {
      pv: 0,
      uv: 0,
      spaRatio: 0,
      source: "empty",
    },
    generatedAtMs: 0,
    windowHours: 24,
  };
}
