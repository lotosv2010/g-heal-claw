"use client";

import { useCallback, useEffect, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  applyTheme,
  getStoredTheme,
  resolveAppearance,
  type ThemeMode,
} from "@/lib/theme";

/**
 * 主题切换器 —— 三档（浅色 / 深色 / 跟随系统）
 *
 * 交互：
 *  - 按钮显示当前"实际外观"的图标（Sun / Moon）
 *  - 点开 Popover 展示三个选项，选中态高亮
 *  - mode=system 时订阅 prefers-color-scheme，系统切换自动跟随
 */
const OPTIONS: readonly { readonly value: ThemeMode; readonly label: string; readonly icon: typeof Sun }[] = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "跟随系统", icon: Laptop },
];

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [mounted, setMounted] = useState(false);

  // 初始从 localStorage 同步一次，避免 SSR 水合时状态错位
  useEffect(() => {
    setMode(getStoredTheme());
    setMounted(true);
  }, []);

  // mode=system 时追随 OS 级变化
  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mode]);

  const handleSelect = useCallback((next: ThemeMode) => {
    setMode(next);
    applyTheme(next);
  }, []);

  // SSR 占位：渲染一个中性图标避免首屏闪烁
  const appearance = mounted ? resolveAppearance(mode) : "light";
  const Icon = appearance === "dark" ? Moon : Sun;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label="切换主题">
          <Icon className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-40 p-1.5">
        <div className="text-muted-foreground px-2 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide">
          外观
        </div>
        <div className="flex flex-col gap-0.5">
          {OPTIONS.map((opt) => {
            const isActive = mode === opt.value;
            const OptIcon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                aria-pressed={isActive}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent/60",
                )}
              >
                <OptIcon className="size-4" aria-hidden />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
