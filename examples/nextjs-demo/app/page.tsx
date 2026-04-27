"use client";

import Link from "next/link";
import { GHealClaw } from "@g-heal-claw/sdk";

/**
 * Demo 入口首页
 *
 * 上半部分保留原有的 SDK 手动 API 演示按钮（captureMessage / captureException /
 * addBreadcrumb）；下半部分作为目录，跳转到性能与异常场景路由。
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
];

const ERROR_ROUTES: readonly DemoRoute[] = [
  { href: "/errors/sync", label: "Sync Throw", hint: "同步异常 + captureException" },
  { href: "/errors/promise", label: "Promise Reject", hint: "未处理的 rejection" },
  { href: "/errors/resource", label: "Resource 404", hint: "静态资源加载失败" },
  { href: "/errors/runtime", label: "Runtime TypeError", hint: "undefined 属性访问" },
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

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          SDK 手动 API
        </h2>
        <div className="grid gap-3">
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
            onClick={() => GHealClaw.captureMessage("hello from demo", "info")}
          >
            captureMessage("hello from demo")
          </button>
          <button
            type="button"
            className="rounded-lg bg-rose-600 px-4 py-2 text-white transition hover:bg-rose-700"
            onClick={() => {
              try {
                throw new Error("intentional demo error");
              } catch (err) {
                GHealClaw.captureException(err, { from: "demo-button" });
              }
            }}
          >
            captureException(new Error)
          </button>
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-white transition hover:bg-emerald-700"
            onClick={() =>
              GHealClaw.addBreadcrumb({
                timestamp: Date.now(),
                category: "custom",
                level: "info",
                message: "manual breadcrumb",
              })
            }
          >
            addBreadcrumb(manual)
          </button>
        </div>
      </section>

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
