import type { DeviceContext, PageContext } from "@g-heal-claw/shared";

/**
 * 骨架阶段的设备上下文采集
 *
 * - 浏览器 / 设备类型使用**轻量 UA 嗅探**（零外部依赖，保持 SDK < 10KB gzip 预算）；
 *   完整 ua-parser-js / Client Hints 精细化升级留给 T1.2.4
 * - SSR / jsdom 环境下 navigator 字段可能缺失，这里做了防御降级
 */
export function collectDevice(): DeviceContext {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const win = typeof window !== "undefined" ? window : undefined;
  const scr =
    typeof screen !== "undefined"
      ? screen
      : ({ width: 0, height: 0 } as Screen);
  const ua = nav?.userAgent ?? "";

  return {
    ua: ua || "unknown",
    os: detectOS(ua),
    osVersion: detectOsVersion(ua),
    browser: detectBrowser(ua),
    browserVersion: detectBrowserVersion(ua),
    deviceType: detectDeviceType(ua),
    screen: {
      width: scr.width ?? 0,
      height: scr.height ?? 0,
      dpr: win?.devicePixelRatio ?? 1,
    },
    network: collectNetwork(nav),
    language: nav?.language ?? "en",
    timezone:
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC",
  };
}

/**
 * 浏览器检测顺序很关键：
 *  Edge 的 UA 同时含 "Chrome" → 必须先判 Edge
 *  Opera 的 UA 同时含 "Chrome"（Chromium 内核）→ 必须先判 Opera
 *  Chrome 的 UA 同时含 "Safari" → 必须先判 Chrome 再判 Safari
 */
function detectBrowser(ua: string): string {
  if (!ua) return "unknown";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/SamsungBrowser\//i.test(ua)) return "SamsungBrowser";
  if (/MSIE |Trident\//i.test(ua)) return "IE";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Other";
}

function detectOS(ua: string): string {
  if (!ua) return "unknown";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Android/i.test(ua)) return "Android";
  // iPhone / iPad / iPod 统一归 iOS（iPadOS 13+ UA 可能是 Mac 桌面标识，已在上面匹配 macOS 但我们接受该误判）
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Other";
}

/**
 * 设备类型判断（对齐 DeviceContextSchema.deviceType 枚举）
 *  bot：爬虫 / 无头浏览器
 *  tablet：iPad / Android 非 Mobile
 *  mobile：Android Mobile / iPhone / 一般移动标识
 *  desktop：其他有 UA 的情况
 */
function detectDeviceType(ua: string): DeviceContext["deviceType"] {
  if (!ua) return "unknown";
  if (
    /bot|crawl|spider|slurp|bingpreview|headlesschrome|puppeteer|lighthouse/i.test(
      ua,
    )
  ) {
    return "bot";
  }
  if (/iPad|Tablet|PlayBook/i.test(ua)) return "tablet";
  // Android 平板通常没有 "Mobile" 标识（Google 规范）
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

function detectBrowserVersion(ua: string): string | undefined {
  if (!ua) return undefined;
  const patterns: [RegExp, number][] = [
    [/Edg\/(\d+[\d.]*)/i, 1],
    [/OPR\/(\d+[\d.]*)/i, 1],
    [/Firefox\/(\d+[\d.]*)/i, 1],
    [/SamsungBrowser\/(\d+[\d.]*)/i, 1],
    [/Chrome\/(\d+[\d.]*)/i, 1],
    [/Version\/(\d+[\d.]*).*Safari/i, 1],
  ];
  for (const [re, idx] of patterns) {
    const m = ua.match(re);
    if (m?.[idx]) return m[idx];
  }
  return undefined;
}

function detectOsVersion(ua: string): string | undefined {
  if (!ua) return undefined;
  const winMatch = ua.match(/Windows NT (\d+\.\d+)/);
  if (winMatch) return winMatch[1];
  const macMatch = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
  if (macMatch) return macMatch[1]?.replace(/_/g, ".");
  const androidMatch = ua.match(/Android (\d+[\d.]*)/);
  if (androidMatch) return androidMatch[1];
  const iosMatch = ua.match(/OS (\d+[_]\d+)/);
  if (iosMatch) return iosMatch[1]?.replace(/_/g, ".");
  return undefined;
}

/** Navigator.connection API（Network Information API） */
interface NetworkConnection {
  readonly effectiveType?: string;
  readonly rtt?: number;
  readonly downlink?: number;
}

function collectNetwork(nav: Navigator | undefined): DeviceContext["network"] {
  if (!nav) return undefined;
  const conn = (nav as unknown as { connection?: NetworkConnection }).connection;
  if (!conn?.effectiveType) return undefined;
  return {
    effectiveType: conn.effectiveType,
    rtt: conn.rtt,
    downlink: conn.downlink,
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
