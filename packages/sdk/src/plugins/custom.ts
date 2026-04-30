/**
 * 自定义上报插件（ADR-0023 §2）
 *
 * 职责：SDK 主动业务 API 封装层，分发三类事件：
 *  - custom_event  — 业务埋点（GHealClaw.track）
 *  - custom_metric — 业务测速（GHealClaw.time）
 *  - custom_log    — 分级日志（GHealClaw.log / captureMessage）
 *
 * 与 trackPlugin（被动 DOM 埋点）在 type 维度完全独立。
 *
 * 设计约束：
 *  - 无 DOM 监听：纯粹是主动 API 封装（与 trackPlugin 被动监听彻底分离）
 *  - 幂等 setup：重复 setup 只替换 sharedHub，不产生副作用
 *  - 类型分发：track/time/log 分别产出 custom_event / custom_metric / custom_log
 *  - SSR 降级：未 init（sharedHub 为空）时 API 静默 no-op
 *  - 防日志风暴：
 *    - log.data 序列化超过 8KB → 截断，追加 __truncated: true
 *    - 单会话 custom_log 上限 200 条
 *    - custom_metric.duration 非有限数 / 负数 / 超 24h 静默丢弃
 */
import type {
  CustomEvent as GhcCustomEvent,
  CustomLog as GhcCustomLog,
  CustomMetric as GhcCustomMetric,
} from "@g-heal-claw/shared";
import { createBaseEvent } from "../event.js";
import type { Hub } from "../hub.js";
import type { Plugin } from "../plugin.js";

/** 单会话 custom_log 上限（与 breadcrumb 同数量级，避免日志风暴） */
const MAX_LOGS_PER_SESSION = 200;
/** log.data 单次序列化上限字节数（超出截断） */
const MAX_LOG_DATA_BYTES = 8192;
/** custom_metric.duration 上限（24h，超出视为误用静默丢弃） */
const MAX_METRIC_DURATION_MS = 24 * 3600 * 1000;

export interface CustomPluginOptions {
  /** 是否启用，默认 true；禁用后 track/time/log 均 no-op */
  readonly enabled?: boolean;
  /** 单会话日志上限，默认 200 */
  readonly maxLogsPerSession?: number;
  /** log.data 序列化上限字节，默认 8192 */
  readonly maxLogDataBytes?: number;
}

interface ResolvedOptions {
  readonly enabled: boolean;
  readonly maxLogsPerSession: number;
  readonly maxLogDataBytes: number;
}

/** 模块级状态：跨调用持有当前 Hub 与会话日志计数器 */
let sharedHub: Hub | undefined;
let resolvedOptions: ResolvedOptions | undefined;
let logCount = 0;

/**
 * customPlugin 工厂
 *
 * 本插件无 DOM 监听；setup 仅绑定 Hub 与配置，让三个活性 API 可用。
 */
export function customPlugin(opts: CustomPluginOptions = {}): Plugin {
  const resolved: ResolvedOptions = {
    enabled: opts.enabled ?? true,
    maxLogsPerSession: opts.maxLogsPerSession ?? MAX_LOGS_PER_SESSION,
    maxLogDataBytes: opts.maxLogDataBytes ?? MAX_LOG_DATA_BYTES,
  };

  return {
    name: "custom",
    setup(hub) {
      if (!resolved.enabled) {
        hub.logger.debug("custom plugin: 禁用");
        return;
      }
      // 幂等：重复 setup 只替换引用，不重置 logCount（同一会话延续）
      sharedHub = hub;
      resolvedOptions = resolved;
      hub.logger.debug("custom plugin: 就绪");
    },
  };
}

// ---- 活性 API：track / time / log ----

/**
 * 业务埋点：`GHealClaw.track("cart_add", { sku, price })`
 *
 * 未 init / 禁用 / 空 name 时静默丢弃。
 */
export function track(
  name: string,
  properties?: Record<string, unknown>,
): void {
  const hub = sharedHub;
  if (!hub) return;
  const safeName = (name ?? "").trim();
  if (!safeName) return;
  const event: GhcCustomEvent = {
    ...createBaseEvent(hub, "custom_event"),
    type: "custom_event",
    name: safeName,
    properties: { ...(properties ?? {}) },
  };
  dispatch(hub, event, "custom_event");
}

/**
 * 业务测速：`GHealClaw.time("checkout_time", 1234)`
 *
 * 校验：
 *  - durationMs 必须为有限非负数
 *  - 超过 24h 视为误用，静默丢弃
 */
export function time(
  name: string,
  durationMs: number,
  properties?: Record<string, unknown>,
): void {
  const hub = sharedHub;
  if (!hub) return;
  const safeName = (name ?? "").trim();
  if (!safeName) return;
  if (!Number.isFinite(durationMs)) return;
  if (durationMs < 0) return;
  if (durationMs > MAX_METRIC_DURATION_MS) return;
  const event: GhcCustomMetric = {
    ...createBaseEvent(hub, "custom_metric"),
    type: "custom_metric",
    name: safeName,
    duration: durationMs,
    properties: properties ? { ...properties } : undefined,
  };
  dispatch(hub, event, "custom_metric");
}

/**
 * 分级日志：`GHealClaw.log("warn", "payment retry", { orderId })`
 *
 * 防日志风暴：
 *  - data 序列化超过 maxLogDataBytes（默认 8KB）→ 截断，追加 __truncated: true
 *  - 单会话超过 maxLogsPerSession（默认 200）→ 后续静默丢弃
 */
export function log(
  level: "info" | "warn" | "error",
  message: string,
  data?: unknown,
): void {
  const hub = sharedHub;
  if (!hub) return;
  const opts = resolvedOptions;
  if (!opts) return;
  if (logCount >= opts.maxLogsPerSession) return;
  const safeMessage = typeof message === "string" ? message : String(message ?? "");
  if (!safeMessage) return;
  const safeData = data !== undefined ? truncateData(data, opts.maxLogDataBytes) : undefined;
  const event: GhcCustomLog = {
    ...createBaseEvent(hub, "custom_log"),
    type: "custom_log",
    level,
    message: safeMessage,
    data: safeData,
    breadcrumbs: [...hub.scope.breadcrumbs],
  };
  logCount += 1;
  dispatch(hub, event, "custom_log");
}

// ---- 内部工具 ----

/**
 * 超限截断：将 data 序列化后若超出上限，保留前缀并追加 __truncated 标记。
 * 仅对象 / 数组有意义；基本类型直接返回原值。
 */
function truncateData(data: unknown, maxBytes: number): unknown {
  try {
    const serialized = JSON.stringify(data);
    if (serialized === undefined) return data;
    if (serialized.length <= maxBytes) return data;
    // 对象 / 数组：返回截断后的占位对象，保留原 JSON 前缀供排障
    return {
      __truncated: true,
      __originalBytes: serialized.length,
      __preview: serialized.slice(0, maxBytes),
    };
  } catch {
    // 循环引用 / 无法序列化 → 静默降级为标记对象
    return { __truncated: true, __reason: "serialize_failed" };
  }
}

function dispatch(
  hub: Hub,
  event: GhcCustomEvent | GhcCustomMetric | GhcCustomLog,
  kind: "custom_event" | "custom_metric" | "custom_log",
): void {
  hub.logger.debug("custom dispatch", kind, event.eventId);
  void hub.transport.send(event);
}

// ---- 测试辅助：允许测试重置模块级状态 ----

/** 测试用：清空 sharedHub 与日志计数器 */
export function __resetCustomPluginForTests(): void {
  sharedHub = undefined;
  resolvedOptions = undefined;
  logCount = 0;
}
