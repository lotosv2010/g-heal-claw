import { describe, expect, it } from "vitest";
import { NavigationTimingSchema } from "@g-heal-claw/shared";
import { mapNavigationTiming } from "./navigation-timing.js";

/**
 * 构造一个最小但真实的 `PerformanceNavigationTiming` 片段
 *
 * 不做真实 DOM，只用字面量覆盖函数读取的字段；其余字段以 0 填充以便通过 TS 校验。
 */
function buildEntry(
  overrides: Partial<PerformanceNavigationTiming>,
): PerformanceNavigationTiming {
  return {
    // timing 基础
    startTime: 0,
    redirectStart: 0,
    redirectEnd: 0,
    domainLookupStart: 10,
    domainLookupEnd: 20,
    connectStart: 20,
    connectEnd: 50,
    secureConnectionStart: 0,
    requestStart: 50,
    responseStart: 100,
    responseEnd: 200,
    domInteractive: 300,
    domContentLoadedEventStart: 310,
    domContentLoadedEventEnd: 320,
    loadEventStart: 400,
    loadEventEnd: 450,
    type: "navigate",
    // 其他 PerformanceEntry 字段（类型需要但函数不读）
    duration: 0,
    name: "",
    entryType: "navigation",
    ...overrides,
  } as unknown as PerformanceNavigationTiming;
}

describe("mapNavigationTiming", () => {
  it("正常 HTTP 请求：ssl/redirect 均 undefined", () => {
    const out = mapNavigationTiming(buildEntry({}));
    expect(out).not.toBeNull();
    expect(out?.dns).toBe(10);
    expect(out?.tcp).toBe(30);
    expect(out?.ssl).toBeUndefined();
    expect(out?.redirect).toBeUndefined();
    expect(out?.request).toBe(50);
    expect(out?.response).toBe(100);
    expect(out?.domParse).toBe(100);
    expect(out?.domReady).toBe(10);
    expect(out?.resourceLoad).toBe(80);
    expect(out?.total).toBe(450);
    expect(out?.type).toBe("navigate");
    // 输出必须通过 shared Zod Schema 校验
    expect(NavigationTimingSchema.safeParse(out).success).toBe(true);
  });

  it("HTTPS 请求：secureConnectionStart>0 时 ssl 有值", () => {
    const out = mapNavigationTiming(
      buildEntry({ secureConnectionStart: 30, connectEnd: 50 }),
    );
    expect(out?.ssl).toBe(20);
  });

  it("经过重定向：redirectEnd>0 时 redirect 有值", () => {
    const out = mapNavigationTiming(
      buildEntry({ redirectStart: 5, redirectEnd: 15 }),
    );
    expect(out?.redirect).toBe(10);
  });

  it("loadEventEnd=0 表示加载未完成，返回 null", () => {
    expect(mapNavigationTiming(buildEntry({ loadEventEnd: 0 }))).toBeNull();
  });

  it("type 未知时降级为 navigate（防御浏览器差异）", () => {
    const out = mapNavigationTiming(
      buildEntry({ type: "unknown" as unknown as NavigationTimingType }),
    );
    expect(out?.type).toBe("navigate");
  });

  it("time clock skew 负值保护：max(0, ...) 后仍通过 Schema", () => {
    const out = mapNavigationTiming(
      buildEntry({ domainLookupEnd: 5, domainLookupStart: 10 }),
    );
    expect(out?.dns).toBe(0);
    expect(NavigationTimingSchema.safeParse(out).success).toBe(true);
  });

  it("prerender 类型透传", () => {
    const out = mapNavigationTiming(
      buildEntry({ type: "prerender" as unknown as NavigationTimingType }),
    );
    expect(out?.type).toBe("prerender");
  });
});
