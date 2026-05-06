"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { ChevronDown, Clock, LogOut, RefreshCw, User } from "lucide-react";
import { GithubIcon } from "@/components/dashboard/github-icon";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { findNavByPathname } from "@/lib/nav";
import { apiLogout, getAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ProjectSwitcher } from "./project-switcher";
import { EnvironmentSwitcher } from "./environment-switcher";
import {
  DEFAULT_PRESET,
  TIME_PRESETS,
  formatCustomPhrase,
  getSelectionLabel,
  parseTimeSelection,
  type PresetKey,
} from "@/lib/time-range";

/**
 * 顶栏（上下文化）：
 *  - 左：当前子页面名称 +（占位）项目 / DNS / 环境切换
 *  - 右：时间范围选择器（单 Popover：左列快捷按钮 / 右列 range 日历）+ 刷新
 *
 * 时间通过 URL 单向广播：
 *  - 预设：`?range=24h`
 *  - 自定义：`?from=<ISO>&to=<ISO>`
 *  子页面（服务端 `searchParams` / 客户端 `useSearchParams`）均可订阅。
 */
export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageTitle = useMemo(() => {
    return findNavByPathname(pathname)?.label ?? "控制台";
  }, [pathname]);

  const selection = useMemo(
    () => parseTimeSelection(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const buttonLabel = getSelectionLabel(selection);

  const [open, setOpen] = useState(false);
  // 草稿 range：右侧 DayPicker 的编辑态；进入 Popover 时从当前 selection 同步
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(
    undefined,
  );

  // 每次打开时同步一次草稿，保证展示当前有效选择
  useEffect(() => {
    if (!open) return;
    setDraftRange(
      selection.kind === "custom"
        ? {
            from: new Date(selection.range.fromMs),
            to: new Date(selection.range.toMs),
          }
        : undefined,
    );
  }, [open, selection]);

  const applyPreset = useCallback(
    (next: PresetKey) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("from");
      params.delete("to");
      if (next === DEFAULT_PRESET) params.delete("range");
      else params.set("range", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      setOpen(false);
    },
    [pathname, router, searchParams],
  );

  const applyCustomRange = useCallback(() => {
    if (!draftRange?.from || !draftRange.to) return;
    // 归一到「整天」：from=00:00:00.000，to=23:59:59.999
    const fromIso = new Date(
      draftRange.from.getFullYear(),
      draftRange.from.getMonth(),
      draftRange.from.getDate(),
      0,
      0,
      0,
      0,
    ).toISOString();
    const toIso = new Date(
      draftRange.to.getFullYear(),
      draftRange.to.getMonth(),
      draftRange.to.getDate(),
      23,
      59,
      59,
      999,
    ).toISOString();

    const params = new URLSearchParams(searchParams.toString());
    params.delete("range");
    params.set("from", fromIso);
    params.set("to", toIso);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setOpen(false);
  }, [draftRange, pathname, router, searchParams]);

  const canApply = !!(draftRange?.from && draftRange.to);
  const activePreset: PresetKey | null =
    selection.kind === "preset" ? selection.preset : null;

  // 用户信息：从 access token payload 解析（简易方式，仅获取 email）
  const userEmail = useMemo(() => {
    const token = getAccessToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.email as string | undefined;
    } catch {
      return null;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await apiLogout();
    router.push("/login");
  }, [router]);

  return (
    // Topbar：磨砂半透明背景（macOS 窗口 toolbar 风），极弱底部分割
    <header className="bg-background/75 sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-black/[0.04] px-8 backdrop-blur-xl dark:border-white/[0.06]">
      {/* 左：页面名 + 项目切换 + 环境切换 */}
      <div className="flex min-w-0 items-center gap-4">
        <h1 className="text-foreground truncate text-[15px] font-semibold tracking-tight">
          {pageTitle}
        </h1>
        <span className="bg-border/70 h-4 w-px" aria-hidden />
        <ProjectSwitcher />
        <EnvironmentSwitcher />
      </div>

      {/* 右：时间选择器（单 Popover：左快捷按钮 / 右日期范围）+ 刷新 */}
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              aria-label="切换时间范围"
            >
              <Clock className="size-3.5" aria-hidden />
              <span>{buttonLabel}</span>
              <ChevronDown
                className="text-muted-foreground size-3.5"
                aria-hidden
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-auto p-0"
          >
            <div className="flex">
              {/* 左列：快捷按钮 —— 高亮当前预设；点击立即应用 */}
              <div className="bg-muted/30 flex w-36 flex-col gap-1 border-r p-2">
                <div className="text-muted-foreground px-2 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide">
                  快捷选择
                </div>
                {TIME_PRESETS.map((p) => {
                  const isActive = activePreset === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyPreset(p.key)}
                      aria-pressed={isActive}
                      className={cn(
                        "w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        isActive &&
                          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* 右列：日期范围选择器 + 底部操作 */}
              <div className="flex flex-col">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={draftRange}
                  onSelect={setDraftRange}
                  defaultMonth={
                    draftRange?.from ??
                    new Date(new Date().setMonth(new Date().getMonth() - 1))
                  }
                  disabled={{ after: new Date() }}
                  autoFocus
                />
                <div className="flex items-center justify-between gap-2 border-t p-3">
                  <div className="text-muted-foreground text-xs">
                    {draftRange?.from && draftRange.to ? (
                      <>
                        已选：
                        <span className="text-foreground font-medium">
                          {formatCustomPhrase({
                            fromMs: draftRange.from.getTime(),
                            toMs: draftRange.to.getTime(),
                          })}
                        </span>
                      </>
                    ) : (
                      "请选择起止日期以启用自定义区间"
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpen(false)}
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      onClick={applyCustomRange}
                      disabled={!canApply}
                    >
                      应用
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button variant="outline" size="icon" aria-label="刷新">
          <RefreshCw className="size-4" aria-hidden />
        </Button>
        <Button
          asChild
          variant="outline"
          size="icon"
          aria-label="GitHub 仓库"
          title="GitHub 仓库"
        >
          <a
            href="https://github.com/lotosv2010/g-heal-claw"
            target="_blank"
            rel="noopener noreferrer"
          >
            <GithubIcon className="size-4" aria-hidden />
          </a>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="用户菜单">
              <User className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6}>
            <DropdownMenuLabel className="text-[13px] font-normal">
              {userEmail || "用户"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="gap-2">
              <LogOut className="size-3.5" aria-hidden />
              登出
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ThemeToggle />
      </div>
    </header>
  );
}

