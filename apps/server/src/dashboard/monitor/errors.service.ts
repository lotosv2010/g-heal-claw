import { Injectable, Logger } from "@nestjs/common";
import {
  ErrorsService,
  type CategoryCountRow,
  type CategoryTrendRow,
  type DimensionRow,
  type ErrorWindowParams,
  type SupportedDimensionColumn,
  type SubTypeCountRow,
  type TrendRow,
  type TopGroupRow,
} from "../../modules/errors/errors.service.js";
import type {
  DeltaDirection,
  ErrorCategory,
  ErrorCategoryDto,
  ErrorCategoryTrendBucketDto,
  ErrorDimensionKey,
  ErrorDimensionRowDto,
  ErrorDimensionsDto,
  ErrorOverviewDto,
  ErrorSubType,
  ErrorSubTypeDto,
  ErrorSummaryDto,
  ErrorsOverviewQuery,
  ErrorTopGroupDto,
  ErrorTrendBucketDto,
} from "../dto/errors-overview.dto.js";

/**
 * Dashboard 异常大盘装配层（ADR-0016 §3 + SPEC 9 分类 / 8 维度扩展）
 *
 * 策略：
 *  - 两次窗口聚合 → summary 环比
 *  - bySubType(5) + categories(9) 双份：前者兼容旧前端，后者是新视图
 *  - trend(5) + categoryTrend(9) 双份
 *  - dimensions(8)：DB 仅采了 browser / os / device_type → 映射为 browser / os / device；
 *    version / region / carrier / network / platform 尚无数据源，返回空数组（前端 "待采集" 占位）
 *  - 空数据：bySubType 5 占位 + categories 9 占位 + trend/categoryTrend 空数组
 */
@Injectable()
export class DashboardErrorsService {
  private readonly logger = new Logger(DashboardErrorsService.name);

  public constructor(private readonly errors: ErrorsService) {}

  public async getOverview(
    query: ErrorsOverviewQuery,
  ): Promise<ErrorOverviewDto> {
    const { projectId, windowHours, limitGroups } = query;
    const now = Date.now();
    const windowMs = windowHours * 3600_000;

    const granularity = windowHours > 24 ? "day" as const : "hour" as const;
    const environment = query.environment;
    const current: ErrorWindowParams = {
      projectId,
      sinceMs: now - windowMs,
      untilMs: now,
      granularity,
      environment,
    };
    const previous: ErrorWindowParams = {
      projectId,
      sinceMs: now - 2 * windowMs,
      untilMs: now - windowMs,
      granularity,
      environment,
    };

    const [
      summaryCurrent,
      summaryPrevious,
      bySubTypeRows,
      trendRows,
      categoryRows,
      categoryTrendRows,
      topRows,
      browserRows,
      osRows,
      deviceRows,
    ] = await Promise.all([
      this.errors.aggregateSummary(current),
      this.errors.aggregateSummary(previous),
      this.errors.aggregateBySubType(current),
      this.errors.aggregateTrend(current),
      this.errors.aggregateByCategory(current),
      this.errors.aggregateCategoryTrend(current),
      this.errors.aggregateTopGroups(current, limitGroups),
      this.errors.aggregateDimension(current, "browser"),
      this.errors.aggregateDimension(current, "os"),
      this.errors.aggregateDimension(current, "device_type"),
    ]);

    const summary = buildSummary(summaryCurrent, summaryPrevious);
    const bySubType = buildBySubType(bySubTypeRows, summary.totalEvents);
    const trend = buildTrend(trendRows);
    const categories = buildCategories(categoryRows, summary.totalEvents);
    const categoryTrend = buildCategoryTrend(categoryTrendRows);
    const topGroups = buildTopGroups(topRows);
    const dimensions = buildDimensions({
      browser: browserRows,
      os: osRows,
      device: deviceRows,
    });

    return {
      summary,
      bySubType,
      trend,
      categories,
      categoryTrend,
      dimensions,
      topGroups,
    };
  }
}

// ------- Summary -------

function buildSummary(
  current: { totalEvents: number; impactedSessions: number },
  previous: { totalEvents: number; impactedSessions: number },
): ErrorSummaryDto {
  const { deltaPercent, deltaDirection } = computeDelta(
    current.totalEvents,
    previous.totalEvents,
  );
  return {
    totalEvents: current.totalEvents,
    impactedSessions: current.impactedSessions,
    deltaPercent,
    deltaDirection,
  };
}

function computeDelta(
  current: number,
  previous: number,
): { deltaPercent: number; deltaDirection: DeltaDirection } {
  if (previous === 0 || current === 0) {
    return { deltaPercent: 0, deltaDirection: "flat" };
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (Math.abs(rounded) < 0.1) {
    return { deltaPercent: 0, deltaDirection: "flat" };
  }
  return {
    deltaPercent: Math.abs(rounded),
    deltaDirection: rounded > 0 ? "up" : "down",
  };
}

// ------- bySubType（v1，5 分类兼容） -------

const SUB_TYPE_ORDER: readonly ErrorSubType[] = [
  "js",
  "promise",
  "resource",
  "framework",
  "white_screen",
];

function buildBySubType(
  rows: readonly SubTypeCountRow[],
  total: number,
): ErrorSubTypeDto[] {
  const map = new Map<string, number>(rows.map((r) => [r.subType, r.count]));
  return SUB_TYPE_ORDER.map((st) => {
    const count = map.get(st) ?? 0;
    const ratio = total > 0 ? Math.round((count / total) * 10000) / 10000 : 0;
    return { subType: st, count, ratio };
  });
}

// ------- trend（v1，5 分类兼容） -------

function buildTrend(rows: readonly TrendRow[]): ErrorTrendBucketDto[] {
  if (rows.length === 0) return [];
  const byHour = new Map<
    string,
    {
      total: number;
      js: number;
      promise: number;
      resource: number;
      framework: number;
      whiteScreen: number;
    }
  >();
  for (const r of rows) {
    const current =
      byHour.get(r.hour) ??
      {
        total: 0,
        js: 0,
        promise: 0,
        resource: 0,
        framework: 0,
        whiteScreen: 0,
      };
    current.total += r.count;
    switch (r.subType) {
      case "js":
        current.js += r.count;
        break;
      case "promise":
        current.promise += r.count;
        break;
      case "resource":
        current.resource += r.count;
        break;
      case "framework":
        current.framework += r.count;
        break;
      case "white_screen":
        current.whiteScreen += r.count;
        break;
      default:
        break;
    }
    byHour.set(r.hour, current);
  }
  return [...byHour.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([hour, v]) => ({ hour, ...v }));
}

// ------- 9 分类映射 -------

const CATEGORY_ORDER: readonly ErrorCategory[] = [
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

/**
 * (subType, resourceKind) → ErrorCategory
 *
 * - js / promise / white_screen / ajax / api_code → 原样
 * - framework → js_load（当前版本无独立卡位；前端 SPEC 优先 9 分类）
 * - resource →
 *     resource_kind = 'js_load' | 'css_load' | 'image_load' | 'media' → 同名类目
 *     resource_kind = 'other' | null → js_load（兜底）
 */
function toCategory(
  subType: string,
  resourceKind: string | null,
): ErrorCategory | null {
  switch (subType) {
    case "js":
    case "promise":
    case "white_screen":
    case "ajax":
    case "api_code":
      return subType;
    case "framework":
      return "js_load";
    case "resource":
      switch (resourceKind) {
        case "js_load":
        case "css_load":
        case "image_load":
        case "media":
          return resourceKind;
        case "other":
        case null:
        default:
          return "js_load";
      }
    default:
      return null;
  }
}

function buildCategories(
  rows: readonly CategoryCountRow[],
  total: number,
): ErrorCategoryDto[] {
  const counts = new Map<ErrorCategory, number>(
    CATEGORY_ORDER.map((c) => [c, 0]),
  );
  for (const r of rows) {
    const cat = toCategory(r.subType, r.resourceKind);
    if (!cat) continue;
    counts.set(cat, (counts.get(cat) ?? 0) + r.count);
  }
  return CATEGORY_ORDER.map((category) => {
    const count = counts.get(category) ?? 0;
    const ratio = total > 0 ? Math.round((count / total) * 10000) / 10000 : 0;
    return { category, count, ratio };
  });
}

function buildCategoryTrend(
  rows: readonly CategoryTrendRow[],
): ErrorCategoryTrendBucketDto[] {
  if (rows.length === 0) return [];
  interface Bucket {
    total: number;
    js: number;
    promise: number;
    whiteScreen: number;
    ajax: number;
    jsLoad: number;
    imageLoad: number;
    cssLoad: number;
    media: number;
    apiCode: number;
  }
  const byHour = new Map<string, Bucket>();
  const empty = (): Bucket => ({
    total: 0,
    js: 0,
    promise: 0,
    whiteScreen: 0,
    ajax: 0,
    jsLoad: 0,
    imageLoad: 0,
    cssLoad: 0,
    media: 0,
    apiCode: 0,
  });
  for (const r of rows) {
    const bucket = byHour.get(r.hour) ?? empty();
    bucket.total += r.count;
    const cat = toCategory(r.subType, r.resourceKind);
    switch (cat) {
      case "js":
        bucket.js += r.count;
        break;
      case "promise":
        bucket.promise += r.count;
        break;
      case "white_screen":
        bucket.whiteScreen += r.count;
        break;
      case "ajax":
        bucket.ajax += r.count;
        break;
      case "js_load":
        bucket.jsLoad += r.count;
        break;
      case "image_load":
        bucket.imageLoad += r.count;
        break;
      case "css_load":
        bucket.cssLoad += r.count;
        break;
      case "media":
        bucket.media += r.count;
        break;
      case "api_code":
        bucket.apiCode += r.count;
        break;
      default:
        break;
    }
    byHour.set(r.hour, bucket);
  }
  return [...byHour.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([hour, v]) => ({ hour, ...v }));
}

// ------- topGroups -------

function buildTopGroups(rows: readonly TopGroupRow[]): ErrorTopGroupDto[] {
  return rows.map((r) => ({
    subType: normalizeSubType(r.subType),
    category: toCategory(r.subType, r.resourceKind) ?? "js",
    messageHead: r.messageHead,
    count: r.count,
    impactedSessions: r.impactedSessions,
    firstSeen: new Date(r.firstSeenMs).toISOString(),
    lastSeen: new Date(r.lastSeenMs).toISOString(),
    sampleUrl: r.samplePath,
  }));
}

const SUB_TYPE_ALL: readonly ErrorSubType[] = [
  "js",
  "promise",
  "resource",
  "framework",
  "white_screen",
  "ajax",
  "api_code",
];

function normalizeSubType(raw: string): ErrorSubType {
  return (SUB_TYPE_ALL as readonly string[]).includes(raw)
    ? (raw as ErrorSubType)
    : "js";
}

// ------- dimensions -------

/** 8 维度 key → DB 数据源；无数据源的维度返回空数组 */
const DIMENSION_KEYS: readonly ErrorDimensionKey[] = [
  "device",
  "browser",
  "os",
  "version",
  "region",
  "carrier",
  "network",
  "platform",
];

interface DimensionInputs {
  readonly browser: readonly DimensionRow[];
  readonly os: readonly DimensionRow[];
  readonly device: readonly DimensionRow[];
}

function buildDimensions(inputs: DimensionInputs): ErrorDimensionsDto {
  const result = {} as Record<
    ErrorDimensionKey,
    readonly ErrorDimensionRowDto[]
  >;
  for (const key of DIMENSION_KEYS) {
    const source = pickDimension(inputs, key);
    const total = source.reduce((acc, r) => acc + r.count, 0);
    result[key] = source.map((r) => toDimensionRowDto(r, total));
  }
  return result;
}

function pickDimension(
  inputs: DimensionInputs,
  key: ErrorDimensionKey,
): readonly DimensionRow[] {
  switch (key) {
    case "browser":
      return inputs.browser;
    case "os":
      return inputs.os;
    case "device":
      return inputs.device;
    default:
      return [];
  }
}

function toDimensionRowDto(
  row: DimensionRow,
  total: number,
): ErrorDimensionRowDto {
  const sharePercent =
    total > 0 ? Math.round((row.count / total) * 10000) / 100 : 0;
  return {
    value: row.value,
    count: row.count,
    sharePercent,
    impactedSessions: row.impactedSessions,
  };
}

// 未使用占位提示（SupportedDimensionColumn 被 Service 消费；保留导出以便单测复用类型）
export type _DimensionColumn = SupportedDimensionColumn;
