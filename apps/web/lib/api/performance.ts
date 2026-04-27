/**
 * 页面性能概览数据契约（对齐 ADR-0015 响应 DTO）
 *
 * UI 层类型独立于后端 DTO，避免 web 包直接依赖 server 事件 Schema；
 * 后端契约稳定后可抽入 packages/shared，当前保留两侧演进自由度。
 */

export type VitalKey = "LCP" | "FCP" | "CLS" | "INP" | "TTFB";
// 对齐 shadcn Badge variant 命名：destructive = Web Vitals 阈值中的"差"
export type ThresholdTone = "good" | "warn" | "destructive";
export type DeltaDirection = "up" | "down" | "flat";

export interface VitalMetric {
  readonly key: VitalKey;
  /** 主数值（LCP/FCP/INP/TTFB 单位 ms；CLS 无单位） */
  readonly value: number;
  readonly unit: "ms" | "";
  readonly tone: ThresholdTone;
  /** 相对前一周期的环比百分比（正为上升；对 CLS/ms 类，down 一般更优） */
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
  readonly sampleCount: number;
}

export interface LoadStage {
  readonly key:
    | "dns"
    | "tcp"
    | "ssl"
    | "request"
    | "response"
    | "domParse"
    | "resourceLoad"
    | "firstScreen"
    | "lcp";
  readonly label: string;
  /** 该阶段耗时（ms） */
  readonly ms: number;
  /** 瀑布图起点（ms，相对导航起始）—— startMs + ms = endMs */
  readonly startMs: number;
  /** 瀑布图终点（ms，相对导航起始） */
  readonly endMs: number;
}

export interface TrendBucket {
  /** ISO 时间（UTC），代表 1 小时桶左边界 */
  readonly hour: string;
  /** LCP p75 (ms) */
  readonly lcpP75: number;
  /** FCP p75 (ms) */
  readonly fcpP75: number;
  /** INP p75 (ms) */
  readonly inpP75: number;
  /** TTFB p75 (ms) */
  readonly ttfbP75: number;
}

export interface SlowPage {
  readonly url: string;
  readonly sampleCount: number;
  readonly lcpP75Ms: number;
  readonly ttfbP75Ms: number;
  readonly bounceRate: number;
}

export interface PerformanceOverview {
  readonly vitals: readonly VitalMetric[];
  readonly stages: readonly LoadStage[];
  /** 过去 24 小时，每小时一个桶 */
  readonly trend: readonly TrendBucket[];
  readonly slowPages: readonly SlowPage[];
}

/** 页面渲染三态（供 page.tsx 判定 Badge 文案与空态组件） */
export type OverviewSource = "live" | "empty" | "error";

export interface PerformanceOverviewResult {
  readonly source: OverviewSource;
  readonly data: PerformanceOverview;
}

/**
 * 获取页面性能概览
 *
 * 依据 ADR-0015：
 * - 成功 → `source: "live"`（`vitals` 至少一项 sampleCount>0 时即视为 live；否则 empty）
 * - 5xx / fetch 抛错 / JSON 解析失败 → `source: "error"`，降级为 emptyOverview
 * - 目标端点：`${NEXT_PUBLIC_API_BASE_URL}/dashboard/v1/performance/overview?projectId=...`
 */
export async function getPerformanceOverview(): Promise<PerformanceOverviewResult> {
  // 开发默认值：与 apps/server 的 SERVER_PORT=3001、.env.example 一致；
  // 部署时通过 NEXT_PUBLIC_API_BASE_URL 覆盖
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  // 默认值与 examples/nextjs-demo 的 DSN 尾段（`/demo`）保持一致 —— SDK 上报时 projectId=demo
  const projectId =
    process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "demo";

  const url = `${baseUrl}/dashboard/v1/performance/overview?projectId=${encodeURIComponent(projectId)}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error(
        `[performance] ${response.status} ${response.statusText} @ ${url}`,
      );
      return { source: "error", data: emptyOverview() };
    }
    const json = (await response.json()) as { data?: PerformanceOverview };
    const data = json.data ?? emptyOverview();
    const hasSamples = data.vitals.some((v) => v.sampleCount > 0);
    return { source: hasSamples ? "live" : "empty", data };
  } catch (err) {
    // fetch 抛错（网络 / DNS / JSON 解析）统一归入 error，保持页面可渲染
    // eslint-disable-next-line no-console
    console.error(
      `[performance] fetch failed @ ${url} —`,
      (err as Error).message,
    );
    return { source: "error", data: emptyOverview() };
  }
}

/** 空态占位：保留 5 张 Vital 卡片骨架，数值 0、tone good、样本 0 */
export function emptyOverview(): PerformanceOverview {
  const keys: readonly VitalKey[] = ["LCP", "FCP", "CLS", "INP", "TTFB"];
  return {
    vitals: keys.map((key) => ({
      key,
      value: 0,
      unit: key === "CLS" ? "" : "ms",
      tone: "good",
      deltaPercent: 0,
      deltaDirection: "flat",
      sampleCount: 0,
    })),
    stages: [],
    trend: [],
    slowPages: [],
  };
}
