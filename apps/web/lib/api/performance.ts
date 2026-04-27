import { getPerformanceFixture } from "@/lib/fixtures/performance";

/**
 * 页面性能概览数据契约
 *
 * UI 层类型独立于后端 DTO，避免 web 包直接依赖 server 事件 Schema。
 * 后端 T2.1.6 "性能大盘 API" 落地后，在 http 调用处做一次映射即可。
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
  readonly key: "dns" | "tcp" | "ssl" | "request" | "response" | "domParse" | "resourceLoad";
  readonly label: string;
  readonly ms: number;
}

export interface TrendBucket {
  /** ISO 时间（UTC），代表 1 小时桶左边界 */
  readonly hour: string;
  /** LCP p75 (ms) */
  readonly lcpP75: number;
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

/**
 * 获取页面性能概览
 *
 * 本期：返回 `lib/fixtures/performance.ts` 中的静态 mock。
 *
 * TODO(T2.1.6)：替换为 `httpGet<PerformanceOverview>("/dashboard/performance/overview")`
 */
export async function getPerformanceOverview(): Promise<PerformanceOverview> {
  // 包一层 Promise 让调用方的 await 不退化成同步，后续替换为 fetch 时无需改动
  return Promise.resolve(getPerformanceFixture());
}
