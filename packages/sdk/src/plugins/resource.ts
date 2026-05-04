/**
 * ResourcePlugin（ADR-0022 / TM.1.B）
 *
 * 职责：基于 `PerformanceObserver('resource')` 采集所有静态资源加载性能全量样本
 * 并映射为 `ResourceEventSchema`（type='resource'）事件上报。
 *
 * 与 `errorPlugin` / `apiPlugin` 形成三条独立链路（XOR 覆盖）：
 *  - errorPlugin：DOM `error` 事件（4xx/5xx 视觉可见的失败）
 *  - apiPlugin：fetch / XHR patch（业务 API 全量明细）
 *  - resourcePlugin（本）：RT 全量样本；**排除** initiatorType ∈ {fetch, xmlhttprequest, beacon}
 *
 * 设计要点：
 *  - 仅使用 PerformanceObserver 订阅，不采集 DOM error（避免与 errorPlugin 重复）
 *  - 6 类分类：script / stylesheet / image / font / media / other
 *  - failed 判定（RT 层）：transferSize/decodedSize/responseStart 全零 **或** duration=0
 *  - slow 判定：duration > slowThresholdMs（默认 1000）
 *  - SSR 降级 / 无 PerformanceObserver / 不支持 resource entry → 静默跳过
 *  - 幂等 setup：重复调用 setup 不会重复 observe
 *  - 会话单次采样上限 `maxSamplesPerSession`（默认 500），防爆量
 */
import type { ResourceCategory, ResourceEvent } from "@g-heal-claw/shared";
import { createBaseEvent } from "../event.js";
import type { Hub } from "../hub.js";
import type { Plugin } from "../plugin.js";

/** 默认慢资源阈值：1000ms */
const DEFAULT_SLOW_THRESHOLD_MS = 1000;
/** 单次会话最大采样上限（防爆量） */
const DEFAULT_MAX_SAMPLES = 500;
/** 批量 flush 间隔（ms） */
const DEFAULT_FLUSH_INTERVAL_MS = 2000;
/** 单批最大条数 */
const DEFAULT_MAX_BATCH = 30;
/** 字体扩展名识别（initiatorType=css 时用于区分 font） */
const FONT_URL_PATTERN = /\.(woff2?|ttf|otf|eot)(\?|$)/i;
/** 与 apiPlugin 冲突的 initiatorType 黑名单 */
const EXCLUDED_INITIATOR_TYPES = new Set(["fetch", "xmlhttprequest", "beacon"]);

export interface ResourcePluginOptions {
  /** 是否启用采集，默认 true */
  readonly enabled?: boolean;
  /** 慢资源阈值（毫秒），默认 1000 */
  readonly slowThresholdMs?: number;
  /** URL 黑名单（字符串子串或正则） */
  readonly ignoreUrls?: ReadonlyArray<string | RegExp>;
  /** 单次会话最大采样数，默认 500 */
  readonly maxSamplesPerSession?: number;
  /** 批量 flush 间隔（ms），默认 2000 */
  readonly flushIntervalMs?: number;
  /** 单批最大条数，默认 30 */
  readonly maxBatch?: number;
}

interface ResolvedOptions {
  readonly slowThresholdMs: number;
  readonly ignoreUrls: ReadonlyArray<string | RegExp>;
  readonly maxSamplesPerSession: number;
  readonly flushIntervalMs: number;
  readonly maxBatch: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ResourceEntry extends PerformanceResourceTiming {
  // 继承 PerformanceResourceTiming，无额外扩展
}

/** 幂等 setup 标记挂在 hub 上；同一 hub 只订阅一次 */
interface ResourceHubMarker {
  __ghcResourcePatched?: boolean;
}

/**
 * ResourcePlugin 工厂
 */
export function resourcePlugin(opts: ResourcePluginOptions = {}): Plugin {
  const enabled = opts.enabled ?? true;
  const resolved: ResolvedOptions = {
    slowThresholdMs: opts.slowThresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS,
    ignoreUrls: opts.ignoreUrls ?? [],
    maxSamplesPerSession: Math.max(
      1,
      opts.maxSamplesPerSession ?? DEFAULT_MAX_SAMPLES,
    ),
    flushIntervalMs: Math.max(500, opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS),
    maxBatch: Math.max(1, opts.maxBatch ?? DEFAULT_MAX_BATCH),
  };

  return {
    name: "resource",
    setup(hub) {
      if (!enabled) {
        hub.logger.debug("resource plugin: 禁用");
        return;
      }
      if (typeof window === "undefined" || typeof document === "undefined") {
        hub.logger.debug("resource plugin: 非浏览器环境，跳过");
        return;
      }
      if (typeof PerformanceObserver === "undefined") {
        hub.logger.warn("resource plugin: 无 PerformanceObserver，降级为 no-op");
        return;
      }
      const supported =
        PerformanceObserver.supportedEntryTypes?.includes("resource") ?? false;
      if (!supported) {
        hub.logger.warn("resource plugin: 浏览器不支持 resource entry，降级");
        return;
      }

      const marker = hub as unknown as ResourceHubMarker;
      if (marker.__ghcResourcePatched) {
        hub.logger.debug("resource plugin: 已初始化，跳过");
        return;
      }
      marker.__ghcResourcePatched = true;

      const buffer: ResourceEntry[] = [];
      let sampledCount = 0;

      const flush = (): void => {
        if (buffer.length === 0) return;
        const pending = buffer.splice(0, buffer.length);
        for (const entry of pending) {
          dispatch(hub, entry, resolved);
        }
      };

      const enqueue = (entry: ResourceEntry): void => {
        if (!isAcceptable(entry, resolved)) return;
        if (sampledCount >= resolved.maxSamplesPerSession) return;
        sampledCount += 1;
        buffer.push(entry);
        if (buffer.length >= resolved.maxBatch) flush();
      };

      let po: PerformanceObserver;
      try {
        po = new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            enqueue(e as ResourceEntry);
        });
        po.observe({ type: "resource", buffered: true });
      } catch (err) {
        hub.logger.error("resource plugin: observe 失败", err);
        return;
      }

      const timer = setInterval(flush, resolved.flushIntervalMs);

      const onPageHide = (): void => flush();
      const onVisibility = (): void => {
        if (document.visibilityState === "hidden") flush();
      };
      window.addEventListener("pagehide", onPageHide, { once: true });
      document.addEventListener("visibilitychange", onVisibility);

      hub.logger.debug("resource plugin: 已启用");
      void po;
      void timer;
    },
  };
}

// ---- 过滤 / 分类 / 判定 ----

function isAcceptable(
  entry: ResourceEntry,
  opts: ResolvedOptions,
): boolean {
  if (EXCLUDED_INITIATOR_TYPES.has(entry.initiatorType)) return false;
  if (!entry.name) return false;
  if (isIgnored(entry.name, opts.ignoreUrls)) return false;
  return true;
}

function isIgnored(
  url: string,
  patterns: ReadonlyArray<string | RegExp>,
): boolean {
  for (const p of patterns) {
    if (typeof p === "string" && url.includes(p)) return true;
    if (p instanceof RegExp && p.test(url)) return true;
  }
  return false;
}

/**
 * 6 类分类矩阵（ADR-0022 §1）
 */
export function classifyResource(
  initiatorType: string,
  url: string,
): ResourceCategory {
  const t = initiatorType.toLowerCase();
  if (t === "script") return "script";
  if (t === "img" || t === "imageset" || t === "image") return "image";
  if (t === "audio" || t === "video") return "media";
  if (t === "font") return "font";
  if (t === "css" || t === "link") {
    // css 可能是 stylesheet 也可能是 @font-face 请求，依靠 URL 扩展名进一步区分
    if (FONT_URL_PATTERN.test(url)) return "font";
    return "stylesheet";
  }
  return "other";
}

/**
 * 失败判定（仅 RT 层；与 errorPlugin 的 DOM error 形成 XOR）
 */
export function judgeFailed(entry: PerformanceResourceTiming): boolean {
  const transferSize = entry.transferSize ?? 0;
  const decodedSize = entry.decodedBodySize ?? 0;
  const responseStart = entry.responseStart ?? 0;
  if (transferSize === 0 && decodedSize === 0 && responseStart === 0) {
    return true;
  }
  if (entry.duration === 0) return true;
  return false;
}

/**
 * cache 派生（transferSize=0 且 decodedBodySize>0 → hit；否则 miss；缺数据 → unknown）
 */
function deriveCache(
  entry: PerformanceResourceTiming,
): "hit" | "miss" | "unknown" {
  const transfer = entry.transferSize;
  const decoded = entry.decodedBodySize;
  if (transfer === undefined || decoded === undefined) return "unknown";
  if (transfer === 0 && decoded > 0) return "hit";
  return "miss";
}

/**
 * host 派生（URL parse 失败兜底返回空串）
 */
function deriveHost(url: string): string {
  try {
    return new URL(url, window.location.href).host;
  } catch {
    return "";
  }
}

// ---- 分发 ----

function dispatch(
  hub: Hub,
  entry: ResourceEntry,
  opts: ResolvedOptions,
): void {
  const duration = Math.max(0, Math.round(entry.duration));
  const category = classifyResource(entry.initiatorType, entry.name);
  const failed = judgeFailed(entry);
  const slow = !failed && duration > opts.slowThresholdMs;
  const host = deriveHost(entry.name);

  const event: ResourceEvent = {
    ...createBaseEvent(hub, "resource"),
    type: "resource",
    initiatorType: entry.initiatorType,
    category,
    host,
    url: entry.name,
    duration,
    transferSize: safeInt(entry.transferSize),
    encodedSize: safeInt(entry.encodedBodySize),
    decodedSize: safeInt(entry.decodedBodySize),
    protocol: entry.nextHopProtocol || undefined,
    cache: deriveCache(entry),
    slow,
    failed,
    startTime: Math.max(0, Math.round(entry.startTime)),
  };
  hub.logger.debug(
    "resource dispatch",
    category,
    host,
    duration,
    "ms",
    failed ? "failed" : slow ? "slow" : "ok",
  );
  void hub.transport.send(event);
}

function safeInt(n: number | undefined): number | undefined {
  if (n === undefined) return undefined;
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}
