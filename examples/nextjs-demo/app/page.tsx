"use client";

import Link from "next/link";
import { SCENARIO_GROUPS, type ScenarioGroup, type ScenarioRoute } from "./demo-scenarios";

/**
 * Demo 入口首页 —— 按 apps/web 后台菜单分组展示所有测试场景
 *
 * 分组与后台菜单一一对应（页面性能 / 异常分析 / API 监控 / 静态资源），
 * 方便联调时"从 demo 场景直接指向大盘模块"。
 */
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
          的 POST 请求。各分组与后台大盘菜单一一对应。
        </p>
      </header>

      {SCENARIO_GROUPS.map((g) => (
        <RouteSection key={g.key} group={g} />
      ))}

      <footer className="text-xs text-neutral-500">
        配置：NEXT_PUBLIC_GHC_DSN / NEXT_PUBLIC_GHC_ENV / NEXT_PUBLIC_GHC_RELEASE
      </footer>
    </main>
  );
}

const ACCENT_CLASS: Record<ScenarioGroup["accent"], string> = {
  blue: "hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950",
  indigo: "hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950",
  teal: "hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950",
  amber: "hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950",
};

function RouteSection({ group }: { readonly group: ScenarioGroup }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {group.title}
        </h2>
        <span className="text-[11px] text-neutral-400">{group.description}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {group.routes.map((r) => (
          <RouteCard key={r.href} route={r} accentClass={ACCENT_CLASS[group.accent]} />
        ))}
      </div>
    </section>
  );
}

function RouteCard({
  route,
  accentClass,
}: {
  readonly route: ScenarioRoute;
  readonly accentClass: string;
}) {
  return (
    <Link
      href={route.href}
      className={`rounded-xl border border-neutral-200 px-4 py-3 text-sm transition dark:border-neutral-800 ${accentClass}`}
    >
      <div className="font-medium">{route.label}</div>
      <div className="text-xs text-neutral-500">{route.hint}</div>
    </Link>
  );
}
