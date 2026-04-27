"use client";

import { ChevronDown, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// 占位顶栏：项目切换 + 时间范围下拉均为静态展示，真实交互留给 T1.1.7 / T1.6.1
export function Topbar() {
  return (
    <header className="bg-card flex h-14 items-center justify-between border-b px-6">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-xs">项目</span>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          aria-label="切换项目（占位）"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          <span>demo · production</span>
          <ChevronDown className="text-muted-foreground size-3.5" aria-hidden />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          aria-label="切换时间范围（占位）"
        >
          <Clock className="size-3.5" aria-hidden />
          <span>最近 24 小时</span>
          <ChevronDown className="text-muted-foreground size-3.5" aria-hidden />
        </Button>
        <Button variant="outline" size="icon" aria-label="刷新（占位）">
          <RefreshCw className="size-4" aria-hidden />
        </Button>
      </div>
    </header>
  );
}
