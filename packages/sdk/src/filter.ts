import type { SdkEvent } from "@g-heal-claw/shared";
import type { GHealClawOptions } from "./options.js";

/**
 * 事件过滤链（SPEC §3.5）
 *
 * 执行顺序（全部同步，在入队前完成）：
 *  1. 采样率判定（sampleRate + 子类型采样率取最小值）
 *  2. ignoreErrors / ignoreUrls 匹配
 *  3. 敏感字段默认过滤（password / token / secret / authorization）
 *  4. beforeSend 用户自定义拦截（返回 null 丢弃）
 *
 * 返回 null 表示丢弃，返回 SdkEvent 表示放行。
 */

const SENSITIVE_KEYS = /password|passwd|secret|token|authorization|cookie|session_id|credit_card/i;

export function applyFilters(
  event: SdkEvent,
  options: GHealClawOptions,
): SdkEvent | null {
  // 1. 采样
  if (!passesSampling(event, options)) return null;

  // 2. ignoreErrors
  if (event.type === "error" && options.ignoreErrors?.length) {
    const message = (event as Record<string, unknown>).message as string | undefined;
    if (message && matchesAny(message, options.ignoreErrors)) return null;
  }

  // 3. ignoreUrls（API / fetch 事件）
  if ((event.type === "api" || event.type === "error") && options.ignoreUrls?.length) {
    const url = (event as Record<string, unknown>).url as string | undefined;
    if (url && matchesAny(url, options.ignoreUrls)) return null;
  }

  // 4. 敏感字段过滤
  const sanitized = sanitizeEvent(event);

  // 5. beforeSend
  if (options.beforeSend) {
    const result = options.beforeSend(sanitized);
    if (result === null) return null;
    return result;
  }

  return sanitized;
}

function passesSampling(event: SdkEvent, options: GHealClawOptions): boolean {
  const globalRate = options.sampleRate ?? 1.0;

  // 子类型采样率
  let typeRate = 1.0;
  switch (event.type) {
    case "error":
      typeRate = options.errorSampleRate ?? 1.0;
      break;
    case "performance":
    case "long_task":
      typeRate = options.performanceSampleRate ?? 1.0;
      break;
    case "api":
      typeRate = options.tracingSampleRate ?? 1.0;
      break;
  }

  // 取最小值
  const effectiveRate = Math.min(globalRate, typeRate);
  if (effectiveRate >= 1.0) return true;
  if (effectiveRate <= 0) return false;
  return Math.random() < effectiveRate;
}

function matchesAny(value: string, patterns: readonly (string | RegExp)[]): boolean {
  for (const pattern of patterns) {
    if (typeof pattern === "string") {
      if (value.includes(pattern)) return true;
    } else {
      if (pattern.test(value)) return true;
    }
  }
  return false;
}

function sanitizeEvent(event: SdkEvent): SdkEvent {
  return JSON.parse(JSON.stringify(event, (_key, value) => {
    if (typeof _key === "string" && SENSITIVE_KEYS.test(_key)) {
      return "[FILTERED]";
    }
    return value;
  })) as SdkEvent;
}
