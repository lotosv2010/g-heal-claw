/**
 * 异常大盘数据契约（对齐 ADR-0016 §3 + SPEC 9 分类扩展）
 *
 * Web 层作为 server DTO 的消费者：
 *  - 服务端已完成 9 分类拆分（通过 resource_kind）和 8 维度聚合
 *  - 前端仅做 UI 编排；派生函数（buildCategoryCards 等）改为直接读 DTO v2 字段
 *
 * 前后端类型刻意不共享，保留字段演进自由度；稳定后再抽入 packages/shared。
 */

import type { OverviewSource } from "./performance";
import { buildServerHeaders } from "./server-fetch";

/**
 * 服务端子类型 —— 与 `ErrorEventSchema.subType` 同构（共 7 种）
 * 新增 ajax / api_code 对应 SDK httpPlugin 的两种上报分支
 */
export type ErrorSubType =
  | "js"
  | "promise"
  | "resource"
  | "framework"
  | "white_screen"
  | "ajax"
  | "api_code";

/** 面向前端展示的 9 分类（SPEC 卡片/堆叠图/排行表共用） */
export type ErrorCategory =
  | "js"
  | "promise"
  | "white_screen"
  | "ajax"
  | "js_load"
  | "image_load"
  | "css_load"
  | "media"
  | "api_code";

export type DeltaDirection = "up" | "down" | "flat";

/** Top 分组状态（前端视图字段，当前后端未持久化，统一展示为 `unresolved`） */
export type IssueStatus = "unresolved" | "resolved" | "ignored";

export interface ErrorSummary {
  readonly totalEvents: number;
  readonly impactedSessions: number;
  readonly deltaPercent: number;
  readonly deltaDirection: DeltaDirection;
}

/** v1 兼容：5 分类（由 server 保留） */
export interface ErrorSubTypeRatio {
  readonly subType: ErrorSubType;
  readonly count: number;
  readonly ratio: number;
}

/** v1 兼容：5 分类 trend */
export interface ErrorTrendBucket {
  readonly hour: string;
  readonly total: number;
  readonly js: number;
  readonly promise: number;
  readonly resource: number;
  readonly framework: number;
  readonly whiteScreen: number;
}

/** v2：9 分类卡片计数 */
export interface ErrorCategoryRatio {
  readonly category: ErrorCategory;
  readonly count: number;
  readonly ratio: number;
}

/** v2：9 分类堆叠图桶（与 server DTO 字段同步） */
export interface ErrorCategoryTrendBucket {
  readonly hour: string;
  readonly total: number;
  readonly js: number;
  readonly promise: number;
  readonly whiteScreen: number;
  readonly ajax: number;
  readonly jsLoad: number;
  readonly imageLoad: number;
  readonly cssLoad: number;
  readonly media: number;
  readonly apiCode: number;
}

export interface ErrorTopGroup {
  readonly subType: ErrorSubType;
  readonly category: ErrorCategory;
  readonly messageHead: string;
  readonly count: number;
  readonly impactedSessions: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly sampleUrl: string;
}

/** 维度 tab 键 —— 对齐 SPEC（机型/浏览器/操作系统/版本/地域/运营商/网络/平台） */
export type ErrorDimensionKey =
  | "device"
  | "browser"
  | "os"
  | "version"
  | "region"
  | "carrier"
  | "network"
  | "platform";

export interface ErrorDimensionRow {
  readonly value: string;
  readonly count: number;
  /** 占比（0~100，保留 2 位小数） */
  readonly sharePercent: number;
  readonly impactedSessions: number;
}

export type ErrorDimensions = Readonly<
  Record<ErrorDimensionKey, readonly ErrorDimensionRow[]>
>;

export interface ErrorOverview {
  readonly summary: ErrorSummary;
  readonly bySubType: readonly ErrorSubTypeRatio[];
  readonly trend: readonly ErrorTrendBucket[];
  readonly categories: readonly ErrorCategoryRatio[];
  readonly categoryTrend: readonly ErrorCategoryTrendBucket[];
  readonly dimensions: ErrorDimensions;
  readonly topGroups: readonly ErrorTopGroup[];
}

export interface ErrorOverviewResult {
  readonly source: OverviewSource;
  readonly data: ErrorOverview;
}

// ==========================================================================
// 前端派生视图（面向 9 分类卡片 / 堆叠图 / 排行表）
// ==========================================================================

/** 9 分类卡片单元（含"待采集"占位） */
export interface CategoryCard {
  readonly category: ErrorCategory;
  readonly count: number;
  /** 是否已被后端采集 —— 全部 9 类均已采集（SDK httpPlugin 落地后）；保留字段以便降级演练 */
  readonly collected: boolean;
}

/** 排行表行 */
export interface ErrorRankingRow {
  readonly key: string;
  readonly category: ErrorCategory;
  readonly messageHead: string;
  readonly status: IssueStatus;
  readonly count: number;
  readonly countRatio: number;
  readonly reproRate: number;
  readonly impactedUsers: number;
  readonly impactedUsersRatio: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly sampleUrl: string;
}

/** 堆叠图桶 —— 保持与既有组件的字段名（ErrorStackBucket）兼容 */
export interface ErrorStackBucket {
  readonly hour: string;
  readonly js: number;
  readonly promise: number;
  readonly white_screen: number;
  readonly ajax: number;
  readonly js_load: number;
  readonly image_load: number;
  readonly css_load: number;
  readonly media: number;
  readonly api_code: number;
}

// ------- 常量 -------

export const CATEGORY_ORDER: readonly ErrorCategory[] = [
  "js",
  "promise",
  "white_screen",
  "ajax",
  "js_load",
  "image_load",
  "css_load",
  "media",
  "api_code",
];

export const CATEGORY_LABEL: Record<ErrorCategory, string> = {
  js: "JS 错误",
  promise: "Promise 错误",
  white_screen: "白屏",
  ajax: "Ajax 异常",
  js_load: "JS 加载异常",
  image_load: "图片加载异常",
  css_load: "CSS 加载异常",
  media: "音视频资源异常",
  api_code: "接口返回码异常",
};

/** 后端是否已采集 —— 当前全部 9 类均已纳入 SDK 采集管线 */
export const CATEGORY_COLLECTED: Record<ErrorCategory, boolean> = {
  js: true,
  promise: true,
  white_screen: true,
  ajax: true,
  js_load: true,
  image_load: true,
  css_load: true,
  media: true,
  api_code: true,
};

// ==========================================================================
// 数据获取
// ==========================================================================

/**
 * 获取异常大盘总览
 *
 * - 成功 + totalEvents>0 → `source: "live"`
 * - 成功 + totalEvents=0 → `source: "empty"`
 * - 5xx / fetch 抛错 / JSON 解析失败 → `source: "error"`，降级为 emptyErrorOverview
 */
export async function getErrorOverview(): Promise<ErrorOverviewResult> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const projectId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "demo";
  const url = `${baseUrl}/dashboard/v1/errors/overview?projectId=${encodeURIComponent(
    projectId,
  )}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: buildServerHeaders(),
    });
    if (!response.ok) {
      console.error(
        `[errors] ${response.status} ${response.statusText} @ ${url}`,
      );
      return { source: "error", data: emptyErrorOverview() };
    }
    const json = (await response.json()) as { data?: Partial<ErrorOverview> };
    const data = normalizeOverview(json.data);
    const hasEvents = data.summary.totalEvents > 0;
    return { source: hasEvents ? "live" : "empty", data };
  } catch (err) {
    console.error(`[errors] fetch failed @ ${url} —`, (err as Error).message);
    return { source: "error", data: emptyErrorOverview() };
  }
}

/**
 * 归一化服务端响应：补齐 v2 字段（categories / categoryTrend / dimensions），
 * 兼容 v1 旧服务端仅返回 bySubType + trend 的情况。
 */
function normalizeOverview(raw: Partial<ErrorOverview> | undefined): ErrorOverview {
  const empty = emptyErrorOverview();
  if (!raw) return empty;
  return {
    summary: raw.summary ?? empty.summary,
    bySubType: raw.bySubType ?? empty.bySubType,
    trend: raw.trend ?? empty.trend,
    categories: raw.categories ?? empty.categories,
    categoryTrend: raw.categoryTrend ?? empty.categoryTrend,
    dimensions: raw.dimensions ?? empty.dimensions,
    topGroups: raw.topGroups ?? empty.topGroups,
  };
}

export function emptyErrorOverview(): ErrorOverview {
  const subs: readonly ErrorSubType[] = [
    "js",
    "promise",
    "resource",
    "framework",
    "white_screen",
  ];
  const emptyDimensions: ErrorDimensions = {
    device: [],
    browser: [],
    os: [],
    version: [],
    region: [],
    carrier: [],
    network: [],
    platform: [],
  };
  return {
    summary: {
      totalEvents: 0,
      impactedSessions: 0,
      deltaPercent: 0,
      deltaDirection: "flat",
    },
    bySubType: subs.map((subType) => ({ subType, count: 0, ratio: 0 })),
    trend: [],
    categories: CATEGORY_ORDER.map((category) => ({
      category,
      count: 0,
      ratio: 0,
    })),
    categoryTrend: [],
    dimensions: emptyDimensions,
    topGroups: [],
  };
}

// ==========================================================================
// 派生
// ==========================================================================

/** 构建 9 张卡片：直接读服务端 categories 字段，无需前端再拆分 */
export function buildCategoryCards(
  overview: ErrorOverview,
): readonly CategoryCard[] {
  const map = new Map<ErrorCategory, number>(
    overview.categories.map((c) => [c.category, c.count]),
  );
  return CATEGORY_ORDER.map((category) => ({
    category,
    count: map.get(category) ?? 0,
    collected: CATEGORY_COLLECTED[category],
  }));
}

/** 服务端 categoryTrend → 前端 ErrorStackBucket（字段重命名以贴合既有组件） */
export function buildStackBuckets(
  buckets: readonly ErrorCategoryTrendBucket[],
): readonly ErrorStackBucket[] {
  return buckets.map((b) => ({
    hour: b.hour,
    js: b.js,
    promise: b.promise,
    white_screen: b.whiteScreen,
    ajax: b.ajax,
    js_load: b.jsLoad,
    image_load: b.imageLoad,
    css_load: b.cssLoad,
    media: b.media,
    api_code: b.apiCode,
  }));
}

/** 构建排行表行；category 直接读自 server topGroup.category */
export function buildRankingRows(
  overview: ErrorOverview,
): readonly ErrorRankingRow[] {
  const total = overview.summary.totalEvents;
  const totalImpacted = overview.summary.impactedSessions;
  return overview.topGroups.map((g, idx) => {
    const countRatio = total > 0 ? g.count / total : 0;
    const reproRate = g.count > 0 ? g.impactedSessions / g.count : 0;
    const impactedUsersRatio =
      totalImpacted > 0 ? g.impactedSessions / totalImpacted : 0;
    return {
      key: `${g.subType}:${g.messageHead}:${idx}`,
      category: g.category,
      messageHead: g.messageHead,
      status: "unresolved" as const,
      count: g.count,
      countRatio,
      reproRate: Math.min(1, reproRate),
      impactedUsers: g.impactedSessions,
      impactedUsersRatio: Math.min(1, impactedUsersRatio),
      firstSeen: g.firstSeen,
      lastSeen: g.lastSeen,
      sampleUrl: g.sampleUrl,
    };
  });
}

/** 构建 8 维分布：直接透传服务端 dimensions 字段 */
export function buildDimensions(overview: ErrorOverview): ErrorDimensions {
  return overview.dimensions;
}
