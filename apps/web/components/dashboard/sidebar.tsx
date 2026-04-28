"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

// 左侧导航：固定定位 + 占满视口高度；滚动由导航列表内部承担，骨架与页脚吸顶/吸底
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="bg-card fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r md:flex">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-5">
        <span className="bg-primary text-primary-foreground inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold">
          G
        </span>
        <span className="text-foreground text-sm font-semibold">g-heal-claw</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV.map((item) => {
          const href = `/${item.slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.slug}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="text-muted-foreground shrink-0 border-t px-5 py-3 text-xs">
        v0.0.1 · 骨架阶段
      </div>
    </aside>
  );
}
