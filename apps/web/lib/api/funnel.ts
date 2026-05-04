/**
 * 转化漏斗大盘数据契约（ADR-0027 / tracking/funnel）
 *
 * Web 层消费 server `/dashboard/v1/tracking/funnel`：
 *  - 参数校验失败 / 5xx → source: "error"
 *  - 空窗口（totalEntered=0）→ source: "empty"
 *  - 有样本 → source: "live"
 *
 * Server Component 侧独立类型，避免直接依赖 server DTO；
 * 契约稳定后可抽入 packages/shared。
 */

import type { OverviewSource } from "./performance";
import { buildServerHeaders } from "./server-fetch";

export interface FunnelStep {
  readonly index: number;
  readonly eventName: string;
  readonly users: number;
  /** 本步 / 上一步 · 0~1 · 4 位小数 */
  readonly conversionFromPrev: number;
  /** 本步 / 首步 · 0~1 · 4 位小数 */
  readonly conversionFromFirst: number;
}

export interface FunnelOverview {
  readonly windowHours: number;
  readonly stepWindowMinutes: number;
  readonly totalEntered: number;
  readonly steps: readonly FunnelStep[];
  /** 末步 / 首步 · 0~1 · 4 位小数 */
  readonly overallConversion: number;
}

export interface FunnelOverviewResult {
  readonly source: OverviewSource;
  readonly data: FunnelOverview;
}

/** URL Query（Server Component 侧） */
export interface FunnelQuery {
  readonly steps: readonly string[];
  readonly windowHours: number;
  readonly stepWindowMinutes: number;
}

// ------- 常量 -------

export const FUNNEL_MIN_STEPS = 2;
export const FUNNEL_MAX_STEPS = 8;
export const FUNNEL_DEFAULT_WINDOW_HOURS = 24;
export const FUNNEL_DEFAULT_STEP_WINDOW_MINUTES = 60;
export const FUNNEL_MAX_WINDOW_HOURS = 168;
export const FUNNEL_MAX_STEP_WINDOW_MINUTES = 24 * 60;

/** 默认漏斗步骤（与 demo `tracking/funnel` 场景对齐） */
export const FUNNEL_DEFAULT_STEPS: readonly string[] = [
  "view_home",
  "click_cta",
  "submit_form",
];

// ------- Query 解析 -------

/**
 * 从 searchParams 解析并夹紧到合法区间；
 * 非法输入静默回退到默认值，避免 Server Component 抛错导致整页失败。
 */
export function parseFunnelQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): FunnelQuery {
  const raw = searchParams ?? {};

  const stepsRaw = typeof raw.steps === "string" ? raw.steps : "";
  const parsedSteps = stepsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 128);
  const steps =
    parsedSteps.length >= FUNNEL_MIN_STEPS &&
    parsedSteps.length <= FUNNEL_MAX_STEPS
      ? parsedSteps
      : [...FUNNEL_DEFAULT_STEPS];

  const windowHours = clampInt(
    raw.windowHours,
    1,
    FUNNEL_MAX_WINDOW_HOURS,
    FUNNEL_DEFAULT_WINDOW_HOURS,
  );
  const stepWindowMinutes = clampInt(
    raw.stepWindowMinutes,
    1,
    FUNNEL_MAX_STEP_WINDOW_MINUTES,
    FUNNEL_DEFAULT_STEP_WINDOW_MINUTES,
  );

  return { steps, windowHours, stepWindowMinutes };
}

function clampInt(
  raw: string | string[] | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof raw !== "string") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ------- 数据获取 -------

export async function getFunnelOverview(
  query: FunnelQuery,
): Promise<FunnelOverviewResult> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const projectId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "demo";
  const params = new URLSearchParams({
    projectId,
    steps: query.steps.join(","),
    windowHours: String(query.windowHours),
    stepWindowMinutes: String(query.stepWindowMinutes),
  });
  const url = `${baseUrl}/dashboard/v1/tracking/funnel?${params.toString()}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: buildServerHeaders(),
    });
    if (!response.ok) {
      console.error(
        `[funnel-overview] ${response.status} ${response.statusText} @ ${url}`,
      );
      return { source: "error", data: emptyFunnelOverview(query) };
    }
    const json = (await response.json()) as { data?: Partial<FunnelOverview> };
    const data = normalizeOverview(json.data, query);
    // totalEntered=0 即视作空窗口（首步 0 → 全部比例 0）
    const hasSamples = data.totalEntered > 0;
    return { source: hasSamples ? "live" : "empty", data };
  } catch (err) {
    console.error(
      `[funnel-overview] fetch failed @ ${url} —`,
      (err as Error).message,
    );
    return { source: "error", data: emptyFunnelOverview(query) };
  }
}

function normalizeOverview(
  raw: Partial<FunnelOverview> | undefined,
  query: FunnelQuery,
): FunnelOverview {
  const empty = emptyFunnelOverview(query);
  if (!raw) return empty;
  return {
    windowHours: raw.windowHours ?? empty.windowHours,
    stepWindowMinutes: raw.stepWindowMinutes ?? empty.stepWindowMinutes,
    totalEntered: raw.totalEntered ?? empty.totalEntered,
    steps: raw.steps ?? empty.steps,
    overallConversion: raw.overallConversion ?? empty.overallConversion,
  };
}

export function emptyFunnelOverview(query: FunnelQuery): FunnelOverview {
  return {
    windowHours: query.windowHours,
    stepWindowMinutes: query.stepWindowMinutes,
    totalEntered: 0,
    steps: query.steps.map((eventName, i) => ({
      index: i + 1,
      eventName,
      users: 0,
      conversionFromPrev: 0,
      conversionFromFirst: 0,
    })),
    overallConversion: 0,
  };
}
