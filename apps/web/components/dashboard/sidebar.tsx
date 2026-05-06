"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { NAV_GROUPS, findGroupKeyByPathname, type NavChild } from "@/lib/nav";
import { BrandLogo } from "@/components/dashboard/brand-logo";
import { GithubIcon } from "@/components/dashboard/github-icon";
import { cn } from "@/lib/utils";

const REPO_URL = "https://github.com/lotosv2010/g-heal-claw";
const STORAGE_KEY = "ghc:sidebar:expanded-groups";

/**
 * 左侧导航 —— Finder 式侧栏（分组 + 可折叠）
 *  - 一级：分组标题（可点击折叠），激活组自动展开
 *  - 二级：叶子菜单（原交互保留：圆角 8px、浅蓝激活态）
 *  - 折叠状态：localStorage 持久化，默认展开命中当前 pathname 的分组
 */
/** 需要跨页面保留的 URL 参数（时间范围） */
const PERSISTENT_PARAMS = ["range", "from", "to"] as const;

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 由 pathname 反查当前命中分组（URL 首段即分组 key），用于默认展开
  const activeGroupKey = useMemo(() => {
    return findGroupKeyByPathname(pathname) ?? NAV_GROUPS[0]?.key;
  }, [pathname]);

  // 折叠状态：首次命中当前组；后续从 localStorage 恢复
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(activeGroupKey ? [activeGroupKey] : []),
  );

  // 挂载后恢复 localStorage，避免 SSR hydration mismatch
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        setExpanded(new Set(parsed));
      }
    } catch {
      // 忽略：localStorage 不可用 / 损坏数据，使用默认展开态
    }
  }, []);

  // 确保当前命中分组始终可见（即使用户手动收起也临时展开）
  useEffect(() => {
    if (!activeGroupKey) return;
    setExpanded((prev) => {
      if (prev.has(activeGroupKey)) return prev;
      const next = new Set(prev);
      next.add(activeGroupKey);
      return next;
    });
  }, [activeGroupKey]);

  const toggleGroup = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // 忽略持久化失败
      }
      return next;
    });
  }, []);

  return (
    <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r md:flex">
      <div className="border-sidebar-border flex h-14 shrink-0 items-center gap-2.5 border-b px-5">
        <BrandLogo className="size-7" />
        <span className="text-foreground text-[15px] font-semibold tracking-tight">
          g-heal-claw
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => {
          const isOpen = expanded.has(group.key);
          const GroupIcon = group.icon;
          return (
            <div key={group.key} className="space-y-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                aria-expanded={isOpen}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-semibold uppercase tracking-wide transition-colors",
                  "text-sidebar-foreground/60 hover:text-sidebar-foreground",
                )}
              >
                <GroupIcon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 text-left normal-case">
                  {group.label}
                </span>
                <ChevronRight
                  className={cn(
                    "size-3.5 shrink-0 transition-transform",
                    isOpen && "rotate-90",
                  )}
                  aria-hidden
                />
              </button>
              {isOpen && (
                <div className="ml-2 space-y-0.5 border-l border-black/[0.05] pl-2 dark:border-white/[0.06]">
                  {group.children.map((child) => (
                    <SidebarLink
                      key={child.slug}
                      child={child}
                      pathname={pathname}
                      persistentQuery={searchParams}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-sidebar-border shrink-0 border-t px-5 py-3">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-[11px] transition-colors"
          title="在 GitHub 上查看源码"
        >
          <GithubIcon className="size-3.5" aria-hidden />
          <span>lotosv2010/g-heal-claw</span>
        </a>
        <div className="text-muted-foreground mt-1 text-[11px]">
          v0.0.1 · 骨架阶段
        </div>
      </div>
    </aside>
  );
}

/** 叶子菜单链接；激活判定兼容嵌套路径；保留时间范围参数 */
function SidebarLink({
  child,
  pathname,
  persistentQuery,
}: {
  readonly child: NavChild;
  readonly pathname: string;
  readonly persistentQuery: ReturnType<typeof useSearchParams>;
}) {
  const basePath = `/${child.slug}`;
  const active = pathname === basePath || pathname.startsWith(`${basePath}/`);
  const Icon = child.icon;

  // 保留时间范围参数
  const qs = new URLSearchParams();
  for (const key of PERSISTENT_PARAMS) {
    const val = persistentQuery.get(key);
    if (val) qs.set(key, val);
  }
  const qsStr = qs.toString();
  const href = qsStr ? `${basePath}?${qsStr}` : basePath;

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>{child.label}</span>
    </Link>
  );
}
