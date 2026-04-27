import type { DeviceContext, PageContext } from "@g-heal-claw/shared";

/**
 * 骨架阶段的设备上下文采集
 *
 * 仅填最少必填字段；完整 ua-parser / network / 屏幕精细化采集留给 T1.2.4。
 * SSR / jsdom 环境下 navigator 字段可能缺失，这里做了防御降级。
 */
export function collectDevice(): DeviceContext {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const win = typeof window !== "undefined" ? window : undefined;
  const scr =
    typeof screen !== "undefined"
      ? screen
      : ({ width: 0, height: 0 } as Screen);

  return {
    ua: nav?.userAgent ?? "unknown",
    os: "unknown",
    browser: "unknown",
    deviceType: "unknown",
    screen: {
      width: scr.width ?? 0,
      height: scr.height ?? 0,
      dpr: win?.devicePixelRatio ?? 1,
    },
    language: nav?.language ?? "en",
    timezone:
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC",
  };
}

/**
 * 骨架阶段的页面上下文采集
 *
 * 仅填 url / path / referrer / title；UTM / searchEngine 留给 T1.2.3/T2.3.1。
 */
export function collectPage(): PageContext {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { url: "about:blank", path: "/" };
  }
  const loc = window.location;
  return {
    url: `${loc.origin}${loc.pathname}${loc.search}`,
    path: loc.pathname || "/",
    referrer: document.referrer || undefined,
    title: document.title || undefined,
  };
}
