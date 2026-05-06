import { Injectable, Logger } from "@nestjs/common";
import {
  ApiService,
  type ApiSummaryRow,
  type ApiWindowParams,
} from "../../modules/api/api.service.js";
import {
  ErrorsService,
  type ErrorSummaryRow,
  type ErrorWindowParams,
} from "../../modules/errors/errors.service.js";
import {
  PerformanceService,
  type VitalAggregateRow,
  type WindowParams,
} from "../../modules/performance/performance.service.js";
import {
  ResourcesService,
  type ResourceSummaryRow,
  type ResourceWindowParams,
} from "../../modules/resources/resources.service.js";
import {
  VisitsService,
  type VisitsSummaryRow,
  type VisitsWindowParams,
} from "../../modules/visits/visits.service.js";
import type {
  DeltaDirection,
  HealthComponent,
  HealthDto,
  HealthTone,
  OverviewSummaryDto,
  OverviewSummaryQuery,
  SourceState,
} from "./dto/overview-summary.dto.js";

/**
 * 数据总览装配层（ADR-0029）
 *
 * 职责：
 *  - `Promise.allSettled` 并发聚合 5 个已 live 域（errors / performance / api / resources / visits）
 *  - 任一域失败 → 该域 `source=error`，不影响其他域
 *  - 计算全站健康度（错误率 40% + LCP 25% + API 错误率 20% + 资源失败率 15%）
 *  - 空样本权重重分配：某域 source=empty 时其权重按比例摊给其他非空域
 *  - 全空样本 → `score=null, tone=unknown`（不骗评分）
 */
@Injectable()
export class DashboardOverviewService {
  private readonly logger = new Logger(DashboardOverviewService.name);

  public constructor(
    private readonly errors: ErrorsService,
    private readonly performance: PerformanceService,
    private readonly api: ApiService,
    private readonly resources: ResourcesService,
    private readonly visits: VisitsService,
  ) {}

  public async getSummary(query: OverviewSummaryQuery): Promise<OverviewSummaryDto> {
    const { projectId, windowHours } = query;
    const now = Date.now();
    const windowMs = windowHours * 3600_000;

    const granularity = windowHours > 24 ? "day" as const : "hour" as const;
    const environment = query.environment;
    const current = { projectId, sinceMs: now - windowMs, untilMs: now, granularity, environment };
    const previous = {
      projectId,
      sinceMs: now - 2 * windowMs,
      untilMs: now - windowMs,
      granularity,
      environment,
    };

    const [
      errorsCurrentR,
      errorsPreviousR,
      vitalsR,
      apiCurrentR,
      resourcesCurrentR,
      visitsCurrentR,
    ] = await Promise.allSettled([
      this.errors.aggregateSummary(current as ErrorWindowParams),
      this.errors.aggregateSummary(previous as ErrorWindowParams),
      this.performance.aggregateVitals(current as WindowParams),
      this.api.aggregateSummary(current as ApiWindowParams),
      this.resources.aggregateSummary(current as ResourceWindowParams),
      this.visits.aggregateSummary(current as VisitsWindowParams),
    ]);

    const errorsDto = buildErrorsDto(errorsCurrentR, errorsPreviousR, this.logger);
    const performanceDto = buildPerformanceDto(vitalsR, this.logger);
    const apiDto = buildApiDto(apiCurrentR, this.logger);
    const resourcesDto = buildResourcesDto(resourcesCurrentR, this.logger);
    const visitsDto = buildVisitsDto(visitsCurrentR, this.logger);

    const health = calcHealth({
      errors: errorsDto,
      performance: performanceDto,
      api: apiDto,
      resources: resourcesDto,
    });

    return {
      health,
      errors: errorsDto,
      performance: performanceDto,
      api: apiDto,
      resources: resourcesDto,
      visits: visitsDto,
      generatedAtMs: now,
      windowHours,
    };
  }
}

// ===================== 域 DTO 构建 =====================

type Settled<T> = PromiseSettledResult<T>;

function buildErrorsDto(
  currentR: Settled<ErrorSummaryRow>,
  previousR: Settled<ErrorSummaryRow>,
  logger: Logger,
): OverviewSummaryDto["errors"] {
  if (currentR.status === "rejected") {
    logger.warn(`errors.aggregateSummary(current) 失败：${String(currentR.reason)}`);
    return emptyErrors("error");
  }
  const current = currentR.value;
  const previous = previousR.status === "fulfilled" ? previousR.value : null;
  const source: SourceState = current.totalEvents === 0 ? "empty" : "live";
  const { deltaPercent, deltaDirection } = computeDelta(
    current.totalEvents,
    previous?.totalEvents ?? null,
  );
  return {
    totalEvents: current.totalEvents,
    impactedSessions: current.impactedSessions,
    deltaPercent,
    deltaDirection,
    source,
  };
}

function emptyErrors(source: SourceState): OverviewSummaryDto["errors"] {
  return {
    totalEvents: 0,
    impactedSessions: 0,
    deltaPercent: 0,
    deltaDirection: "flat",
    source,
  };
}

/** LCP/INP/CLS p75（tone 按 web-vitals 官方阈值；任一指标 destructive 则整体 destructive） */
function buildPerformanceDto(
  vitalsR: Settled<readonly VitalAggregateRow[]>,
  logger: Logger,
): OverviewSummaryDto["performance"] {
  if (vitalsR.status === "rejected") {
    logger.warn(`performance.aggregateVitals 失败：${String(vitalsR.reason)}`);
    return { lcpP75Ms: 0, inpP75Ms: 0, clsP75: 0, tone: "unknown", source: "error" };
  }
  const rows = vitalsR.value;
  if (rows.length === 0) {
    return { lcpP75Ms: 0, inpP75Ms: 0, clsP75: 0, tone: "unknown", source: "empty" };
  }
  const lcp = rows.find((r) => r.metric === "LCP")?.p75 ?? 0;
  const inp = rows.find((r) => r.metric === "INP")?.p75 ?? 0;
  const cls = rows.find((r) => r.metric === "CLS")?.p75 ?? 0;
  const tones: readonly HealthTone[] = [
    toneLcp(lcp),
    toneInp(inp),
    toneCls(cls),
  ];
  return {
    lcpP75Ms: Math.round(lcp),
    inpP75Ms: Math.round(inp),
    clsP75: Math.round(cls * 1000) / 1000,
    tone: combineTone(tones),
    source: "live",
  };
}

function buildApiDto(
  currentR: Settled<ApiSummaryRow>,
  logger: Logger,
): OverviewSummaryDto["api"] {
  if (currentR.status === "rejected") {
    logger.warn(`api.aggregateSummary 失败：${String(currentR.reason)}`);
    return { totalRequests: 0, errorRate: 0, p75DurationMs: 0, source: "error" };
  }
  const v = currentR.value;
  const source: SourceState = v.totalRequests === 0 ? "empty" : "live";
  const errorRate = v.totalRequests > 0 ? v.failedCount / v.totalRequests : 0;
  return {
    totalRequests: v.totalRequests,
    errorRate: Math.round(errorRate * 10000) / 10000,
    p75DurationMs: Math.round(v.p75DurationMs),
    source,
  };
}

function buildResourcesDto(
  currentR: Settled<ResourceSummaryRow>,
  logger: Logger,
): OverviewSummaryDto["resources"] {
  if (currentR.status === "rejected") {
    logger.warn(`resources.aggregateSummary 失败：${String(currentR.reason)}`);
    return { totalRequests: 0, failureRate: 0, slowCount: 0, source: "error" };
  }
  const v = currentR.value;
  const source: SourceState = v.totalRequests === 0 ? "empty" : "live";
  const failureRate = v.totalRequests > 0 ? v.failedCount / v.totalRequests : 0;
  return {
    totalRequests: v.totalRequests,
    failureRate: Math.round(failureRate * 10000) / 10000,
    slowCount: v.slowCount,
    source,
  };
}

function buildVisitsDto(
  currentR: Settled<VisitsSummaryRow>,
  logger: Logger,
): OverviewSummaryDto["visits"] {
  if (currentR.status === "rejected") {
    logger.warn(`visits.aggregateSummary 失败：${String(currentR.reason)}`);
    return { pv: 0, uv: 0, spaRatio: 0, source: "error" };
  }
  const v = currentR.value;
  const source: SourceState = v.pv === 0 ? "empty" : "live";
  const spaRatio = v.pv > 0 ? v.spaNavCount / v.pv : 0;
  return {
    pv: v.pv,
    uv: v.uv,
    spaRatio: Math.round(spaRatio * 10000) / 10000,
    source,
  };
}

// ===================== 健康度公式 =====================

/** 基础权重（合计 100）。visits 不参与健康度，仅做呈现 */
const BASE_WEIGHTS = {
  errors: 40,
  performance: 25,
  api: 20,
  resources: 15,
} as const;

/** 扣分阈值起点 / 满扣点 → signal ≥ full 时扣满 weight */
const DEDUCT_RULES = {
  /** 错误率：>0.5% 起扣，>5% 扣满 */
  errors: { start: 0.005, full: 0.05 },
  /** API 错误率：>1% 起扣，>10% 扣满 */
  api: { start: 0.01, full: 0.1 },
  /** 资源失败率：>2% 起扣，>20% 扣满 */
  resources: { start: 0.02, full: 0.2 },
} as const;

interface HealthInputs {
  readonly errors: OverviewSummaryDto["errors"];
  readonly performance: OverviewSummaryDto["performance"];
  readonly api: OverviewSummaryDto["api"];
  readonly resources: OverviewSummaryDto["resources"];
}

/**
 * 健康度计算（纯函数，便于单测）
 *
 * 规则：
 *  - source=error 的域：权重设 0，不影响评分（避免把瞬时错误变成永久扣分）
 *  - source=empty 的域：权重设 0，其权重按比例摊给其他非空域（新项目刚接入时此时不会全部扣分）
 *  - 所有域均 empty/error → `score=null, tone=unknown`
 */
export function calcHealth(inputs: HealthInputs): HealthDto {
  // Step 1：统计每域"是否参与评分"
  const participating = {
    errors: inputs.errors.source === "live",
    performance: inputs.performance.source === "live",
    api: inputs.api.source === "live",
    resources: inputs.resources.source === "live",
  };

  const activeSum =
    (participating.errors ? BASE_WEIGHTS.errors : 0) +
    (participating.performance ? BASE_WEIGHTS.performance : 0) +
    (participating.api ? BASE_WEIGHTS.api : 0) +
    (participating.resources ? BASE_WEIGHTS.resources : 0);

  if (activeSum === 0) {
    return { score: null, tone: "unknown", components: [] };
  }

  // Step 2：权重归一（非参与域权重=0，其他按原比例放大至合 100）
  const scale = 100 / activeSum;
  const normalized = {
    errors: participating.errors ? BASE_WEIGHTS.errors * scale : 0,
    performance: participating.performance ? BASE_WEIGHTS.performance * scale : 0,
    api: participating.api ? BASE_WEIGHTS.api * scale : 0,
    resources: participating.resources ? BASE_WEIGHTS.resources * scale : 0,
  };

  // Step 3：逐域计算 penalty
  const components: HealthComponent[] = [];

  // errors：totalEvents / impactedSessions 近似 → 用事件数作 signal 太粗；这里把 totalEvents 归一到
  // "每次会话的错误数" 模拟错误率；无会话回退 0；生产可换 impactedSessions/activeSessions
  const errorsSignal = participating.errors
    ? inputs.errors.impactedSessions > 0
      ? inputs.errors.totalEvents /
        Math.max(inputs.errors.impactedSessions, 1) /
        100 // 简化：每 100 次会话的错误占比
      : 0
    : 0;
  components.push({
    key: "errors",
    signal: round4(errorsSignal),
    weight: round4(normalized.errors),
    deducted: participating.errors
      ? round4(
          normalized.errors *
            penaltyRatio(
              errorsSignal,
              DEDUCT_RULES.errors.start,
              DEDUCT_RULES.errors.full,
            ),
        )
      : 0,
  });

  // performance：按 LCP tone 离散扣分（good=0 / warn=0.6 / destructive=1）
  const perfSignal = inputs.performance.lcpP75Ms;
  const perfRatio = participating.performance
    ? lcpPenaltyRatio(inputs.performance.lcpP75Ms)
    : 0;
  components.push({
    key: "performance",
    signal: round4(perfSignal),
    weight: round4(normalized.performance),
    deducted: round4(normalized.performance * perfRatio),
  });

  // api：错误率 signal
  const apiSignal = inputs.api.errorRate;
  components.push({
    key: "api",
    signal: round4(apiSignal),
    weight: round4(normalized.api),
    deducted: participating.api
      ? round4(
          normalized.api *
            penaltyRatio(apiSignal, DEDUCT_RULES.api.start, DEDUCT_RULES.api.full),
        )
      : 0,
  });

  // resources：失败率 signal
  const resSignal = inputs.resources.failureRate;
  components.push({
    key: "resources",
    signal: round4(resSignal),
    weight: round4(normalized.resources),
    deducted: participating.resources
      ? round4(
          normalized.resources *
            penaltyRatio(
              resSignal,
              DEDUCT_RULES.resources.start,
              DEDUCT_RULES.resources.full,
            ),
        )
      : 0,
  });

  const totalDeducted = components.reduce((acc, c) => acc + c.deducted, 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - totalDeducted)));

  return { score, tone: toneForScore(score), components };
}

// ===================== 工具函数 =====================

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * 线性扣分比例：signal < start 不扣；signal ≥ full 扣满；之间线性插值
 */
function penaltyRatio(signal: number, start: number, full: number): number {
  if (signal <= start) return 0;
  if (signal >= full) return 1;
  return (signal - start) / (full - start);
}

/** LCP 离散扣分（good=0 / warn=0.6 / destructive=1） */
function lcpPenaltyRatio(lcp: number): number {
  if (lcp <= 0) return 0;
  if (lcp <= 2500) return 0;
  if (lcp <= 4000) return 0.6;
  return 1;
}

function toneLcp(lcp: number): HealthTone {
  if (lcp <= 0) return "unknown";
  if (lcp <= 2500) return "good";
  if (lcp <= 4000) return "warn";
  return "destructive";
}

function toneInp(inp: number): HealthTone {
  if (inp <= 0) return "unknown";
  if (inp <= 200) return "good";
  if (inp <= 500) return "warn";
  return "destructive";
}

function toneCls(cls: number): HealthTone {
  if (cls <= 0) return "unknown";
  if (cls <= 0.1) return "good";
  if (cls <= 0.25) return "warn";
  return "destructive";
}

/** 多 tone 合并：存在 destructive 取 destructive，否则 warn 优先于 good；全 unknown → unknown */
function combineTone(tones: readonly HealthTone[]): HealthTone {
  let worst: HealthTone = "unknown";
  const order: Record<HealthTone, number> = {
    unknown: 0,
    good: 1,
    warn: 2,
    destructive: 3,
  };
  for (const t of tones) {
    if (order[t] > order[worst]) worst = t;
  }
  return worst;
}

function toneForScore(score: number): HealthTone {
  if (score >= 85) return "good";
  if (score >= 60) return "warn";
  return "destructive";
}

function computeDelta(
  current: number,
  previous: number | null,
): { deltaPercent: number; deltaDirection: DeltaDirection } {
  if (previous == null || previous === 0 || current === 0) {
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
