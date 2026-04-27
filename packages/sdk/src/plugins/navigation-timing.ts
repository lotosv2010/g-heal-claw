import type { NavigationTiming } from "@g-heal-claw/shared";

/**
 * PerformanceNavigationTiming.type → NavigationTiming.type 映射
 *
 * W3C 规范：`"navigate" | "reload" | "back_forward" | "prerender"`
 * 与 `NavigationTimingSchema` 的 enum 完全一致，但做防御性映射避免
 * 个别浏览器返回旧值（如 `"back-forward"` 带横线）。
 */
function mapNavigationType(
  // 宽松 string：lib.dom.d.ts 的 NavigationTimingType 不包含 "prerender"（W3C L2 扩展），
  // 但实际浏览器（Chromium 109+）会返回该值；统一按字符串比较做防御。
  type: string,
): NavigationTiming["type"] {
  switch (type) {
    case "navigate":
    case "reload":
    case "back_forward":
    case "prerender":
      return type;
    default:
      return "navigate";
  }
}

/**
 * 将 `PerformanceNavigationTiming` 映射为 `NavigationTiming`（SPEC §4.2.1）
 *
 * 字段策略（对齐 ADR-0014 §4）：
 * - `secureConnectionStart === 0` 视为 HTTP 请求，ssl 置 undefined（Zod 可选）
 * - `redirectEnd === 0` 视为无重定向，redirect 置 undefined
 * - 所有阶段差值使用 `Math.max(0, ...)` 防御负值（浏览器 clock skew 边界）
 *
 * 返回 null 表示 entry 字段缺失无法映射（例如 loadEventEnd 尚未发生）。
 */
export function mapNavigationTiming(
  entry: PerformanceNavigationTiming,
): NavigationTiming | null {
  // loadEventEnd === 0 表示 load 事件尚未完成，此时瀑布图不完整，拒绝采集
  if (entry.loadEventEnd <= 0) return null;

  const diff = (a: number, b: number): number => Math.max(0, a - b);

  const ssl =
    entry.secureConnectionStart > 0
      ? diff(entry.connectEnd, entry.secureConnectionStart)
      : undefined;

  const redirect =
    entry.redirectEnd > 0
      ? diff(entry.redirectEnd, entry.redirectStart)
      : undefined;

  return {
    dns: diff(entry.domainLookupEnd, entry.domainLookupStart),
    tcp: diff(entry.connectEnd, entry.connectStart),
    ssl,
    request: diff(entry.responseStart, entry.requestStart),
    response: diff(entry.responseEnd, entry.responseStart),
    // 从响应结束到 HTML 解析完成可交互
    domParse: diff(entry.domInteractive, entry.responseEnd),
    // DOMContentLoaded 事件自身耗时（框架初始化同步工作量指标）
    domReady: diff(
      entry.domContentLoadedEventEnd,
      entry.domContentLoadedEventStart,
    ),
    // 从 DOMContentLoaded 到 load 事件：子资源并行下载完成的时间
    resourceLoad: diff(entry.loadEventStart, entry.domContentLoadedEventEnd),
    total: diff(entry.loadEventEnd, entry.startTime),
    redirect,
    type: mapNavigationType(entry.type),
  };
}
