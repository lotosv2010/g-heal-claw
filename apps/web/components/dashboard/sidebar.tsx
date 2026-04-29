"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import { BrandLogo } from "@/components/dashboard/brand-logo";
import { GithubIcon } from "@/components/dashboard/github-icon";
import { cn } from "@/lib/utils";

const REPO_URL = "https://github.com/lotosv2010/g-heal-claw";

/**
 * 左侧导航 —— Finder 式侧栏
 *  - 背景 bg-sidebar（比主背景略深一档，形成层级）
 *  - 无硬分割线：头部/底部用 border-sidebar-border（rgba 6% 黑）极弱边框
 *  - 激活态：浅蓝底 + 系统蓝文字（非实底 primary，减少视觉重量）
 *  - 圆角 rounded-lg（8px），贴近 macOS 控件
 */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r md:flex">
      <div className="border-sidebar-border flex h-14 shrink-0 items-center gap-2.5 border-b px-5">
        <BrandLogo className="size-7" />
        <span className="text-foreground text-[15px] font-semibold tracking-tight">
          g-heal-claw
        </span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV.map((item) => {
          const href = `/${item.slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.slug}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span>{item.label}</span>
            </Link>
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
