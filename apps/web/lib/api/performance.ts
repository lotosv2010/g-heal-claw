/**
 * 页面性能概览数据契约（对齐 ADR-0015 响应 DTO）
 *
 * UI 层类型独立于后端 DTO，避免 web 包直接依赖 server 事件 Schema；
 * 后端契约稳定后可抽入 packages/shared，当前保留两侧演进自由度。
 */

import { buildServerHeaders } from "./server-fetch";

/**
 * 性能指标枚举（与后端 DTO `apps/server/src/dashboard/dto/overview.dto.ts` 对齐）
 *
 * FID / TTI 为**已废弃**指标：
 * - FID 已被 INP 取代（web.dev Core Web Vital 2024.3 切换）
 * - TTI 因 Google 停止维护 polyfill，仅做近似采集
 *
 * 仍保留字段以满足完整性与历史对比需要；UI 侧需渲染「已废弃」Badge。
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
  // Lighthouse 专属：Speed Index；SDK 不采集，面板渲染为 N/A
  | "SI";
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

/**
 * 性能趋势桶（1 小时一桶）— 承载多系列"性能视图"全部字段
 *
 * 与服务端 TrendBucketDto 对齐；图表默认只展示 `样本数 + 首屏时间(FMP)`，
 * 其余字段通过 legend 切换显示。字段缺失时为 0（前端视为无数据）。
 */
export interface TrendBucket {
  /** ISO 时间（UTC），代表 1 小时桶左边界 */
  readonly hour: string;
  // Web Vitals
  readonly lcpP75: number;
  readonly fcpP75: number;
  readonly clsP75: number;
  readonly inpP75: number;
  readonly ttfbP75: number;
  readonly fidP75: number;
  readonly ttiP75: number;
  readonly tbtP75: number;
  // FSP / 首屏时间
  readonly fmpP75: number;
  // Lighthouse 实验室近似 Speed Index（ADR-0018）
  readonly siP75: number;
  // Navigation 子字段
  readonly dnsP75: number;
  readonly tcpP75: number;
  readonly sslP75: number;
  readonly contentDownloadP75: number;
  readonly domParseP75: number;
  readonly resourceLoadP75: number;
  // 样本数（近似 PV）
  readonly sampleCount: number;
}

export interface SlowPage {
  readonly url: string;
  readonly sampleCount: number;
  readonly lcpP75Ms: number;
  readonly ttfbP75Ms: number;
  readonly bounceRate: number;
}

/**
 * 首屏时间（FMP）页面行 —— 用于"首屏时间"表格
 *
 * - fmpAvgMs：FSP 指标按 path 聚合的平均值（ms）
 * - fullyLoadedAvgMs：LCP 平均值（ms，作为"页面完全加载"的近似）
 * - within3sRatio：[0,1]，0.95 表示 95% 的访问 ≤ 3s 打开
 */
export interface FmpPage {
  readonly url: string;
  readonly sampleCount: number;
  readonly fmpAvgMs: number;
  readonly fullyLoadedAvgMs: number;
  readonly within3sRatio: number;
}

/** 维度分布行（浏览器 / 操作系统 / 平台） */
export interface DimensionRow {
  readonly value: string;
  readonly sampleCount: number;
  /** 占比（0~100，保留 2 位小数） */
  readonly sharePercent: number;
  readonly fmpAvgMs: number;
}

/** 维度数据键 —— 其他维度（机型 / 版本 / 地域 / 运营商 / 网络）Phase 2 启用 */
export type DimensionKey = "browser" | "os" | "platform";

export interface Dimensions {
  readonly browser: readonly DimensionRow[];
  readonly os: readonly DimensionRow[];
  readonly platform: readonly DimensionRow[];
}

/** 长任务 3 级分布（ADR-0018；阈值：50ms~2s / 2s~5s / ≥5s） */
export interface LongTaskTiers {
  readonly longTask: number;
  readonly jank: number;
  readonly unresponsive: number;
}

/** 长任务概览（来自 perf_events_raw type='long_task' 聚合） */
export interface LongTaskSummary {
  readonly count: number;
  readonly totalMs: number;
  readonly p75Ms: number;
  readonly tiers: LongTaskTiers;
}

export interface PerformanceOverview {
  readonly vitals: readonly VitalMetric[];
  readonly stages: readonly LoadStage[];
  /** 过去 24 小时，每小时一个桶 */
  readonly trend: readonly TrendBucket[];
  readonly slowPages: readonly SlowPage[];
  readonly fmpPages: readonly FmpPage[];
  readonly dimensions: Dimensions;
  readonly longTasks: LongTaskSummary;
}

/** 页面渲染三态（供 page.tsx 判定 Badge 文案与空态组件） */
export type OverviewSource = "live" | "empty" | "error";

export interface PerformanceOverviewResult {
  readonly source: OverviewSource;
  readonly data: PerformanceOverview;
}

/** 概览查询参数（与后端 `OverviewQuerySchema` 对齐的子集） */
export interface PerformanceOverviewParams {
  /** 聚合窗口（小时），1~168；省略则使用后端默认 24 */
  readonly windowHours?: number;
}

/**
 * 获取页面性能概览
 *
 * 依据 ADR-0015：
 * - 成功 → `source: "live"`（`vitals` 至少一项 sampleCount>0 时即视为 live；否则 empty）
 * - 5xx / fetch 抛错 / JSON 解析失败 → `source: "error"`，降级为 emptyOverview
 * - 目标端点：`${NEXT_PUBLIC_API_BASE_URL}/dashboard/v1/performance/overview?projectId=...`
 */
export async function getPerformanceOverview(
  params: PerformanceOverviewParams = {},
): Promise<PerformanceOverviewResult> {
  // 开发默认值：与 apps/server 的 SERVER_PORT=3001、.env.example 一致；
  // 部署时通过 NEXT_PUBLIC_API_BASE_URL 覆盖
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  // 默认值与 examples/nextjs-demo 的 DSN 尾段（`/demo`）保持一致 —— SDK 上报时 projectId=demo
  const projectId =
    process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "demo";

  const qs = new URLSearchParams({ projectId });
  if (params.windowHours != null && Number.isFinite(params.windowHours)) {
    qs.set("windowHours", String(params.windowHours));
  }
  const url = `${baseUrl}/dashboard/v1/performance/overview?${qs.toString()}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: buildServerHeaders(),
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

/** 空态占位：保留 9 张 Vital 卡片骨架（含废弃 FID/TTI + Lighthouse TBT/SI），数值 0、tone good、样本 0 */
export function emptyOverview(): PerformanceOverview {
  const keys: readonly VitalKey[] = [
    "LCP",
    "INP",
    "CLS",
    "TTFB",
    "FCP",
    "TTI",
    "TBT",
    "FID",
    "SI",
  ];
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
    fmpPages: [],
    dimensions: { browser: [], os: [], platform: [] },
    longTasks: {
      count: 0,
      totalMs: 0,
      p75Ms: 0,
      tiers: { longTask: 0, jank: 0, unresponsive: 0 },
    },
  };
}
