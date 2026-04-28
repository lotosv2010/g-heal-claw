import { z } from "zod";

/**
 * Dashboard 性能大盘 API 契约（ADR-0015）
 *
 * 与 `apps/web/lib/api/performance.ts` 的 PerformanceOverview 字段形状保持一致；
 * 前后端类型刻意不共享，保留字段命名演进自由度，待 Phase 6 稳定后再抽入 shared。
 */

// ------- 请求 query -------

export const OverviewQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  /** 聚合窗口（小时），默认 24，最大 168（7d） */
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
  /** 慢页面返回条数，默认 10，最大 50 */
  limitSlowPages: z.coerce.number().int().min(1).max(50).default(10),
});
export type OverviewQuery = z.infer<typeof OverviewQuerySchema>;

// ------- 响应 DTO（与 web 的 PerformanceOverview 对齐） -------

/**
 * 性能指标枚举（与前端契约 `apps/web/lib/api/performance.ts` 一致）
 *
 * FID / TTI 为废弃指标，仍返回字段：
 * - FID 被 INP 取代；TTI Google 已不再维护 polyfill
 * - UI 侧需渲染「已废弃」Badge；未采样时按 sampleCount=0 降级处理
 */
export type VitalKey =
  | "LCP"
  | "FCP"
  | "CLS"
  | "INP"
  | "TTFB"
  | "FID"
  | "TTI"
  | "TBT"
  // Lighthouse 专属：Speed Index；SDK 不采集，在大盘渲染为 N/A
  | "SI";
/** 与 shadcn Badge variant 对齐；destructive = Web Vitals "poor" */
export type ThresholdTone = "good" | "warn" | "destructive";
export type DeltaDirection = "up" | "down" | "flat";

export interface VitalMetricDto {
  readonly key: VitalKey;
  readonly value: number;
  readonly unit: "ms" | "";
  readonly tone: ThresholdTone;
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
  readonly sampleCount: number;
}

export type LoadStageKey =
  | "dns"
  | "tcp"
  | "ssl"
  | "request"
  | "response"
  | "domParse"
  | "resourceLoad"
  | "firstScreen"
  | "lcp";

export interface LoadStageDto {
  readonly key: LoadStageKey;
  readonly label: string;
  readonly ms: number;
  readonly startMs: number;
  readonly endMs: number;
}

/**
 * 性能趋势桶（一小时一个）— 宽表结构，承载多系列图表所需全部字段
 *
 * 设计取舍：
 *  - 保持单一桶结构，避免前端多接口合并逻辑；
 *  - 允许字段缺失（0 代表"无数据"）；CLS 单位无量纲，值保留 3 位精度写入 number；
 *  - sampleCount 取 "该小时内任意指标的最大样本数"（近似 PV），足够绘图提示。
 */
export interface TrendBucketDto {
  readonly hour: string;
  // Web Vitals 系列（p75）
  readonly lcpP75: number;
  readonly fcpP75: number;
  readonly clsP75: number;
  readonly inpP75: number;
  readonly ttfbP75: number;
  readonly fidP75: number;
  readonly ttiP75: number;
  readonly tbtP75: number;
  // 自定义 FSP / 首屏时间（p75）
  readonly fmpP75: number;
  // Lighthouse 实验室近似 Speed Index（p75；ADR-0018 补齐）
  readonly siP75: number;
  // Navigation 阶段（p75）
  readonly dnsP75: number;
  readonly tcpP75: number;
  readonly sslP75: number;
  /** 内容下载 = response 阶段 */
  readonly contentDownloadP75: number;
  readonly domParseP75: number;
  readonly resourceLoadP75: number;
  /** 采样数（近似 PV，取当小时内出现过的最大指标样本数） */
  readonly sampleCount: number;
}

export interface SlowPageDto {
  readonly url: string;
  readonly sampleCount: number;
  readonly lcpP75Ms: number;
  readonly ttfbP75Ms: number;
  /** Phase 2.3 访问分析落地前，本字段恒为 0 */
  readonly bounceRate: number;
}

/** 首屏时间（FMP）页面行 —— 替代 SlowPage 的 FMP 视图 */
export interface FmpPageDto {
  readonly url: string;
  readonly sampleCount: number;
  readonly fmpAvgMs: number;
  readonly fullyLoadedAvgMs: number;
  /** [0,1] 之间，0.95 表示 95% 的访问在 3s 内首屏完成 */
  readonly within3sRatio: number;
}

/** 维度分布行（浏览器 / 操作系统 / 平台） */
export interface DimensionRowDto {
  readonly value: string;
  readonly sampleCount: number;
  readonly sharePercent: number;
  readonly fmpAvgMs: number;
}

/** 维度键（与 perf_events_raw 可用列一一对应；其他维度 Phase 2 启用） */
export type DimensionKey = "browser" | "os" | "platform";

/** 一组维度数据（浏览器 / OS / 平台） */
export interface DimensionsDto {
  readonly browser: readonly DimensionRowDto[];
  readonly os: readonly DimensionRowDto[];
  readonly platform: readonly DimensionRowDto[];
}

/** 长任务三级分布（ADR-0018；阈值见 SPEC §3.3.2） */
export interface LongTaskTiersDto {
  /** 50 ms ≤ duration < 2000 ms */
  readonly longTask: number;
  /** 2000 ms ≤ duration < 5000 ms —— 卡顿（用户可感知） */
  readonly jank: number;
  /** duration ≥ 5000 ms —— 无响应（页面假死） */
  readonly unresponsive: number;
}

/** 长任务概览（来自 perf_events_raw 中 type = 'long_task' 的行） */
export interface LongTaskSummaryDto {
  /** 时间窗内长任务样本数 */
  readonly count: number;
  /** 所有长任务 duration 总和（ms），反映阻塞强度 */
  readonly totalMs: number;
  /** 长任务 duration 的 p75（ms） */
  readonly p75Ms: number;
  /** 3 级分布 —— 服务端按 duration 回填，兼容历史未携带 tier 的事件 */
  readonly tiers: LongTaskTiersDto;
}

export interface PerformanceOverviewDto {
  readonly vitals: readonly VitalMetricDto[];
  readonly stages: readonly LoadStageDto[];
  readonly trend: readonly TrendBucketDto[];
  readonly slowPages: readonly SlowPageDto[];
  readonly fmpPages: readonly FmpPageDto[];
  readonly dimensions: DimensionsDto;
  readonly longTasks: LongTaskSummaryDto;
}
