"use client";

import Link from "next/link";

/**
 * Demo 入口首页
 *
 * 作为性能 / 异常场景目录，所有测试场景以路由形式组织在 (demo) 分组下。
 * SDK 会在 GHealClawProvider 初始化时自动订阅 Web Vitals / 错误事件，
 * 各场景页面通过自然交互（加载大图、阻塞主线程等）触发对应指标。
 */
interface DemoRoute {
  readonly href: string;
  readonly label: string;
  readonly hint: string;
}

const PERF_ROUTES: readonly DemoRoute[] = [
  { href: "/perf/heavy-dom", label: "Heavy DOM", hint: "大量节点 → FCP/LCP 压力" },
  { href: "/perf/slow-image", label: "Slow Image", hint: "大图 LCP 目标" },
  { href: "/perf/layout-shift", label: "Layout Shift", hint: "触发 CLS" },
  { href: "/perf/long-task", label: "Long Task", hint: "主线程阻塞 → INP 劣化" },
  { href: "/perf/tbt", label: "TBT", hint: "总阻塞时间 · Lighthouse 核心指标" },
  { href: "/perf/fid", label: "FID (deprecated)", hint: "首次输入延迟 · 已被 INP 取代" },
  { href: "/perf/tti", label: "TTI (deprecated)", hint: "可交互时间 · Google 已停止维护" },
];

// 对应大盘 9 分类卡片：js / promise / white_screen / ajax / js_load / image_load / css_load / media / api_code
const ERROR_ROUTES: readonly DemoRoute[] = [
  { href: "/errors/sync", label: "Sync Throw (js)", hint: "同步异常 + captureException" },
  { href: "/errors/runtime", label: "Runtime TypeError (js)", hint: "undefined 属性访问" },
  { href: "/errors/promise", label: "Promise Reject", hint: "未处理的 rejection" },
  { href: "/errors/white-screen", label: "White Screen", hint: "手动上报 subType=white_screen" },
  { href: "/errors/ajax-fail", label: "Ajax 异常", hint: "fetch / XHR 非 2xx 或网络失败" },
  { href: "/errors/api-code", label: "API Code 异常", hint: "响应 code ≠ 0 的业务异常" },
  { href: "/errors/js-load", label: "JS 加载异常", hint: "404 的 <script>" },
  { href: "/errors/image-load", label: "图片加载异常", hint: "404 的 <img>" },
  { href: "/errors/css-load", label: "CSS 加载异常", hint: "404 的 <link stylesheet>" },
  { href: "/errors/media-load", label: "音视频加载异常", hint: "404 的 <video> / <audio>" },
  { href: "/errors/resource", label: "Resource 404（综合）", hint: "静态资源加载失败样例" },
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">g-heal-claw SDK Demo</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          打开 DevTools → Network，触发交互后观察对
          <code className="mx-1 rounded bg-neutral-200 px-1 py-0.5 text-xs dark:bg-neutral-800">
            /ingest/v1/events
          </code>
          的 POST 请求。
        </p>
      </header>

      <RouteSection title="性能场景" routes={PERF_ROUTES} accent="blue" />
      <RouteSection title="异常场景" routes={ERROR_ROUTES} accent="rose" />

      <footer className="text-xs text-neutral-500">
        配置：NEXT_PUBLIC_GHC_DSN / NEXT_PUBLIC_GHC_ENV / NEXT_PUBLIC_GHC_RELEASE
      </footer>
    </main>
  );
}

function RouteSection({
  title,
  routes,
  accent,
}: {
  readonly title: string;
  readonly routes: readonly DemoRoute[];
  readonly accent: "blue" | "rose";
}) {
  const hoverBorder =
    accent === "blue"
      ? "hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950"
      : "hover:border-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950";
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {routes.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className={`rounded-lg border border-neutral-200 px-4 py-3 text-sm transition dark:border-neutral-800 ${hoverBorder}`}
          >
            <div className="font-medium">{r.label}</div>
            <div className="text-xs text-neutral-500">{r.hint}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
