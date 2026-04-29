import React from "react";

interface Feature {
  icon: string;
  title: string;
  details: string;
  link: string;
}

const FEATURES: Feature[] = [
  {
    icon: "🛡️",
    title: "异常自动聚合",
    details: "JS / Promise / Resource / HTTP 四类异常指纹聚合为 Issue，叠加 Sourcemap 还原源码堆栈。",
    link: "/guide/errors",
  },
  {
    icon: "⚡",
    title: "Core Web Vitals 开箱即用",
    details: "LCP / INP / CLS / FCP / TTFB 全量采集，瀑布图 12 节点对齐 W3C Navigation Timing。",
    link: "/reference/performance-metrics",
  },
  {
    icon: "🔌",
    title: "API 全链路可观测",
    details: "自动拦截 fetch / XHR，状态码分桶、慢请求、TTFB 构成、错误分类一站呈现。",
    link: "/guide/api",
  },
  {
    icon: "📊",
    title: "埋点 · 访问 · 漏斗",
    details: "代码 / 曝光 / 声明式埋点，UV·PV·停留·跳出·留存·漏斗一体化。",
    link: "/guide/visits",
  },
  {
    icon: "🤖",
    title: "AI 自愈 PR",
    details: "AI 诊断根因 + 自动生成修复 PR，配可控的白名单与人工确认策略。",
    link: "/guide/settings",
  },
  {
    icon: "🧩",
    title: "轻量 SDK · 插件化",
    details: "浏览器包 gzip 控制在 10KB 内；按需加载插件，支持 React / Vue / Nuxt / Next / Umi。",
    link: "/sdk/installation",
  },
];

export function HomeFeatures(): JSX.Element {
  return (
    <div className="overflow-hidden m-auto flex flex-wrap max-w-6xl ghc-home-features">
      {FEATURES.map((f) => (
        <a key={f.title} href={f.link} className="ghc-feature-cell">
          <article className="ghc-feature-card">
            <div className="ghc-feature-icon">{f.icon}</div>
            <h3 className="ghc-feature-title">{f.title}</h3>
            <p className="ghc-feature-details">{f.details}</p>
          </article>
        </a>
      ))}
    </div>
  );
}
