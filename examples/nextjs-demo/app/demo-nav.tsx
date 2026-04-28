"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Route {
  readonly href: string;
  readonly label: string;
  readonly hint: string;
}

const PERF_ROUTES: readonly Route[] = [
  { href: "/perf/heavy-dom", label: "Heavy DOM", hint: "大量节点 → FCP/LCP 压力" },
  { href: "/perf/slow-image", label: "Slow Image", hint: "大图 LCP 目标" },
  { href: "/perf/layout-shift", label: "Layout Shift", hint: "触发 CLS" },
  { href: "/perf/long-task", label: "Long Task", hint: "主线程阻塞 → INP 劣化" },
  { href: "/perf/tbt", label: "TBT", hint: "总阻塞时间 · Lighthouse 核心指标" },
  { href: "/perf/fid", label: "FID (deprecated)", hint: "首次输入延迟 · 已被 INP 取代" },
  { href: "/perf/tti", label: "TTI (deprecated)", hint: "可交互时间 · Google 已停止维护" },
];

const ERROR_ROUTES: readonly Route[] = [
  { href: "/errors/sync", label: "Sync Throw", hint: "同步异常 + captureException" },
  { href: "/errors/promise", label: "Promise Reject", hint: "未处理的 rejection" },
  { href: "/errors/resource", label: "Resource 404", hint: "静态资源加载失败" },
  { href: "/errors/runtime", label: "Runtime TypeError", hint: "undefined 属性访问" },
];

export function DemoNav() {
  const pathname = usePathname();
  return (
    <nav className="grid gap-4 text-sm">
      <RouteGroup title="性能场景" routes={PERF_ROUTES} active={pathname} />
      <RouteGroup title="异常场景" routes={ERROR_ROUTES} active={pathname} />
      <Link
        href="/"
        className={`rounded px-2 py-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 ${
          pathname === "/" ? "font-semibold text-neutral-900 dark:text-neutral-100" : ""
        }`}
      >
        ← 返回首页
      </Link>
    </nav>
  );
}

function RouteGroup({
  title,
  routes,
  active,
}: {
  readonly title: string;
  readonly routes: readonly Route[];
  readonly active: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </div>
      <ul className="grid gap-1">
        {routes.map((r) => {
          const isActive = active === r.href;
          return (
            <li key={r.href}>
              <Link
                href={r.href}
                className={`block rounded px-2 py-1 transition ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                }`}
              >
                <div className="font-medium">{r.label}</div>
                <div className={`text-xs ${isActive ? "text-blue-100" : "text-neutral-500"}`}>
                  {r.hint}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
