"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SCENARIO_GROUPS, type ScenarioRoute } from "./demo-scenarios";

/**
 * Demo 左侧导航 —— 分组与 apps/web 后台菜单一致：
 * 页面性能 / 异常分析 / API 监控 / 静态资源
 */
export function DemoNav() {
  const pathname = usePathname();
  return (
    <nav className="grid gap-5 text-sm">
      {SCENARIO_GROUPS.map((g) => (
        <RouteGroup key={g.key} title={g.title} routes={g.routes} active={pathname} />
      ))}
      <Link
        href="/"
        className={`rounded-lg px-2 py-1 text-xs text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100 ${
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
  readonly routes: readonly ScenarioRoute[];
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
                className={`block rounded-lg px-2 py-1 transition ${
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
