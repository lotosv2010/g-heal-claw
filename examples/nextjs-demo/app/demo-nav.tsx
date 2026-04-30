"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SCENARIO_GROUPS,
  type ScenarioGroup,
  type ScenarioGroupKey,
  type ScenarioRoute,
} from "./demo-scenarios";

/**
 * Demo 左侧导航 —— 分组与 apps/web 后台菜单一致：
 * 页面性能 / 异常分析 / API 监控 / 静态资源 / 埋点分析 / 自定义上报
 *
 * 交互：
 *  - 一级分组标题可点击折叠/展开
 *  - 展开状态持久化到 localStorage（key: GHC_DEMO_NAV_OPEN_GROUPS）
 *  - 初始策略：默认全部展开；当前 pathname 所在分组始终强制展开（即便 localStorage 记录为折叠）
 */
const STORAGE_KEY = "GHC_DEMO_NAV_OPEN_GROUPS";

export function DemoNav() {
  const pathname = usePathname();

  // 命中当前 pathname 的分组 key（用于强制展开）
  const activeGroupKey = useMemo<ScenarioGroupKey | null>(() => {
    const hit = SCENARIO_GROUPS.find((g) =>
      g.routes.some((r) => r.href === pathname),
    );
    return hit?.key ?? null;
  }, [pathname]);

  // 初始所有分组默认展开
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SCENARIO_GROUPS.map((g) => [g.key, true])),
  );

  // 挂载后读取 localStorage（SSR 友好，首次渲染保持全部展开避免 hydration mismatch）
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setOpenMap((prev) => ({ ...prev, ...parsed }));
    } catch {
      // localStorage 不可用时保持默认值
    }
  }, []);

  // 持久化
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(openMap));
    } catch {
      // 写入失败静默忽略
    }
  }, [openMap]);

  const toggle = useCallback((key: string) => {
    setOpenMap((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <nav className="grid gap-3 text-sm">
      {SCENARIO_GROUPS.map((g) => {
        // 命中当前路由的分组强制展开，避免用户折叠后看不到自己正在访问的页面
        const isActive = g.key === activeGroupKey;
        const isOpen = isActive ? true : openMap[g.key] ?? true;
        return (
          <RouteGroup
            key={g.key}
            group={g}
            active={pathname}
            isOpen={isOpen}
            onToggle={() => toggle(g.key)}
            forceOpen={isActive}
          />
        );
      })}
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
  group,
  active,
  isOpen,
  onToggle,
  forceOpen,
}: {
  readonly group: ScenarioGroup;
  readonly active: string;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly forceOpen: boolean;
}) {
  const panelId = `demo-nav-panel-${group.key}`;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={forceOpen}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={`flex w-full items-center justify-between rounded px-1 py-0.5 text-xs font-semibold uppercase tracking-wide transition ${
          forceOpen
            ? "cursor-default text-neutral-700 dark:text-neutral-200"
            : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        }`}
        title={forceOpen ? "当前页面所在分组，始终展开" : isOpen ? "点击折叠" : "点击展开"}
      >
        <span>{group.title}</span>
        <Chevron open={isOpen} />
      </button>
      <ul
        id={panelId}
        hidden={!isOpen}
        className="grid gap-1"
      >
        {group.routes.map((r) => (
          <RouteItem key={r.href} route={r} active={active} />
        ))}
      </ul>
    </div>
  );
}

function RouteItem({
  route,
  active,
}: {
  readonly route: ScenarioRoute;
  readonly active: string;
}) {
  const isActive = active === route.href;
  return (
    <li>
      <Link
        href={route.href}
        className={`block rounded-lg px-2 py-1 transition ${
          isActive
            ? "bg-blue-600 text-white"
            : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
        }`}
      >
        <div className="font-medium">{route.label}</div>
        <div className={`text-xs ${isActive ? "text-blue-100" : "text-neutral-500"}`}>
          {route.hint}
        </div>
      </Link>
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={`transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path
        d="M4 2.5L7.5 6L4 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
