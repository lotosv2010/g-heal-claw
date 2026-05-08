"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

/** 维度配置 */
const DIMENSION_OPTIONS = [
  { key: "browser", label: "浏览器" },
  { key: "os", label: "操作系统" },
  { key: "deviceType", label: "设备类型" },
  { key: "language", label: "语言" },
  { key: "timezone", label: "时区" },
  { key: "pagePath", label: "页面路径" },
] as const;

type DimensionKey = (typeof DIMENSION_OPTIONS)[number]["key"];

interface DimensionFilterBarProps {
  /** 已加载的维度可选值（从 server component 传入） */
  readonly availableValues?: Record<string, string[]>;
}

/**
 * 通用维度筛选器（URL searchParams 驱动）
 *
 * 读写 URL 中的 browser/os/deviceType/language/timezone/pagePath 参数，
 * 逗号分隔多选。Server Component 首屏根据 searchParams 查询后传入。
 */
export function DimensionFilterBar({ availableValues }: DimensionFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // 从 URL 解析当前激活的筛选
  const getActive = useCallback((): Record<DimensionKey, string[]> => {
    const result = {} as Record<DimensionKey, string[]>;
    for (const { key } of DIMENSION_OPTIONS) {
      const raw = searchParams.get(key);
      result[key] = raw ? raw.split(",").filter(Boolean) : [];
    }
    return result;
  }, [searchParams]);

  const [active, setActive] = useState(getActive);

  useEffect(() => {
    setActive(getActive());
  }, [getActive]);

  // 更新 URL
  const applyFilters = useCallback(
    (next: Record<DimensionKey, string[]>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const { key } of DIMENSION_OPTIONS) {
        const values = next[key];
        if (values && values.length > 0) {
          params.set(key, values.join(","));
        } else {
          params.delete(key);
        }
      }
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router, searchParams, startTransition],
  );

  // 切换某个值
  const toggleValue = (dimension: DimensionKey, value: string) => {
    const current = active[dimension] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    const updated = { ...active, [dimension]: next };
    setActive(updated);
    applyFilters(updated);
  };

  // 清除所有筛选
  const clearAll = () => {
    const empty = {} as Record<DimensionKey, string[]>;
    for (const { key } of DIMENSION_OPTIONS) empty[key] = [];
    setActive(empty);
    applyFilters(empty);
  };

  const totalActive = Object.values(active).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {DIMENSION_OPTIONS.map(({ key, label }) => {
        const values = availableValues?.[key] ?? [];
        const selected = active[key] ?? [];
        return (
          <Popover key={key}>
            <PopoverTrigger asChild>
              <Button
                variant={selected.length > 0 ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
              >
                {label}
                {selected.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                    {selected.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="max-h-48 overflow-y-auto space-y-1">
                {values.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">暂无数据</p>
                ) : (
                  values.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`w-full text-left text-xs px-2 py-1 rounded hover:bg-accent ${
                        selected.includes(v) ? "bg-accent font-medium" : ""
                      }`}
                      onClick={() => toggleValue(key, v)}
                    >
                      {v}
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
      {totalActive > 0 && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>
          清除筛选
        </Button>
      )}
    </div>
  );
}
