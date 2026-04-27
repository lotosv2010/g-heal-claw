import type { PerformanceOverview } from "@/lib/api/performance";

/**
 * 性能页静态 mock。数值对齐 PRD §2.1 的 Core Web Vitals 阈值：
 * - LCP ≤ 2.5s 良好；≤ 4s 需改进；> 4s 差
 * - FCP ≤ 1.8s 良好；≤ 3s 需改进；> 3s 差
 * - CLS ≤ 0.1 良好；≤ 0.25 需改进；> 0.25 差
 * - INP ≤ 200ms 良好；≤ 500ms 需改进；> 500ms 差
 * - TTFB ≤ 800ms 良好；≤ 1.8s 需改进；> 1.8s 差
 */
export function getPerformanceFixture(): PerformanceOverview {
  return {
    vitals: [
      {
        key: "LCP",
        value: 2180,
        unit: "ms",
        tone: "good",
        deltaPercent: 4.3,
        deltaDirection: "down",
        sampleCount: 12843,
      },
      {
        key: "FCP",
        value: 1420,
        unit: "ms",
        tone: "good",
        deltaPercent: 1.1,
        deltaDirection: "down",
        sampleCount: 12843,
      },
      {
        key: "CLS",
        value: 0.12,
        unit: "",
        tone: "warn",
        deltaPercent: 6.7,
        deltaDirection: "up",
        sampleCount: 12843,
      },
      {
        key: "INP",
        value: 184,
        unit: "ms",
        tone: "good",
        deltaPercent: 0.0,
        deltaDirection: "flat",
        sampleCount: 11921,
      },
      {
        key: "TTFB",
        value: 612,
        unit: "ms",
        tone: "good",
        deltaPercent: 8.2,
        deltaDirection: "down",
        sampleCount: 12843,
      },
    ],
    stages: [
      { key: "dns", label: "DNS", ms: 38 },
      { key: "tcp", label: "TCP", ms: 72 },
      { key: "ssl", label: "SSL", ms: 96 },
      { key: "request", label: "请求", ms: 112 },
      { key: "response", label: "响应", ms: 196 },
      { key: "domParse", label: "DOM 解析", ms: 354 },
      { key: "resourceLoad", label: "资源加载", ms: 628 },
    ],
    trend: generateTrend(),
    slowPages: [
      {
        url: "/checkout/review",
        sampleCount: 842,
        lcpP75Ms: 3820,
        ttfbP75Ms: 1120,
        bounceRate: 0.18,
      },
      {
        url: "/product/detail/:id",
        sampleCount: 6421,
        lcpP75Ms: 3410,
        ttfbP75Ms: 824,
        bounceRate: 0.22,
      },
      {
        url: "/search",
        sampleCount: 5128,
        lcpP75Ms: 2980,
        ttfbP75Ms: 712,
        bounceRate: 0.27,
      },
      {
        url: "/account/orders",
        sampleCount: 1203,
        lcpP75Ms: 2740,
        ttfbP75Ms: 684,
        bounceRate: 0.11,
      },
      {
        url: "/cart",
        sampleCount: 3087,
        lcpP75Ms: 2510,
        ttfbP75Ms: 598,
        bounceRate: 0.14,
      },
      {
        url: "/category/:slug",
        sampleCount: 4219,
        lcpP75Ms: 2380,
        ttfbP75Ms: 552,
        bounceRate: 0.19,
      },
      {
        url: "/",
        sampleCount: 9842,
        lcpP75Ms: 2190,
        ttfbP75Ms: 498,
        bounceRate: 0.32,
      },
      {
        url: "/login",
        sampleCount: 2104,
        lcpP75Ms: 1980,
        ttfbP75Ms: 462,
        bounceRate: 0.08,
      },
      {
        url: "/help",
        sampleCount: 512,
        lcpP75Ms: 1820,
        ttfbP75Ms: 428,
        bounceRate: 0.41,
      },
      {
        url: "/about",
        sampleCount: 421,
        lcpP75Ms: 1680,
        ttfbP75Ms: 384,
        bounceRate: 0.52,
      },
    ],
  };
}

// 用固定种子生成 24 桶，保证 SSR / CSR 渲染一致，避免 hydration mismatch
function generateTrend() {
  const base = Date.UTC(2026, 3, 27, 0, 0, 0); // 2026-04-27T00:00:00Z
  const buckets = [];
  // 伪随机但稳定：sin 波动 + 线性偏移
  for (let i = 0; i < 24; i++) {
    const phase = (i / 24) * Math.PI * 2;
    const lcp = Math.round(2100 + Math.sin(phase) * 340 + (i % 5) * 28);
    buckets.push({
      hour: new Date(base + i * 3600_000).toISOString(),
      lcpP75: lcp,
    });
  }
  return buckets;
}
