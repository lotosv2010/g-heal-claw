"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FUNNEL_DEFAULT_STEP_WINDOW_MINUTES,
  FUNNEL_DEFAULT_STEPS,
  FUNNEL_DEFAULT_WINDOW_HOURS,
  FUNNEL_MAX_STEPS,
  FUNNEL_MAX_STEP_WINDOW_MINUTES,
  FUNNEL_MAX_WINDOW_HOURS,
  FUNNEL_MIN_STEPS,
  type FunnelQuery,
} from "@/lib/api/funnel";

/**
 * 漏斗配置表单（URL 驱动 · ADR-0027）
 *
 * 所有状态通过 URL searchParams 持久化，天然可分享；Client Component 仅负责：
 *  1. 维护待提交的本地输入草稿
 *  2. 点击"查询"时 router.replace 写回 URL，触发 Server Component 重新抓数
 *
 * 不做运行时校验提示（Server 侧 Zod 已兜底），仅做最小夹紧（数字 / 步数上下限）。
 */
export function FunnelConfigForm({ initial }: { initial: FunnelQuery }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [stepsText, setStepsText] = useState(initial.steps.join(", "));
  const [windowHours, setWindowHours] = useState(String(initial.windowHours));
  const [stepWindowMinutes, setStepWindowMinutes] = useState(
    String(initial.stepWindowMinutes),
  );

  const stepCount = useMemo(() => {
    return stepsText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0).length;
  }, [stepsText]);

  const stepCountInvalid =
    stepCount < FUNNEL_MIN_STEPS || stepCount > FUNNEL_MAX_STEPS;

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const steps = stepsText
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (steps.length < FUNNEL_MIN_STEPS || steps.length > FUNNEL_MAX_STEPS) {
        return;
      }
      const params = new URLSearchParams(searchParams?.toString());
      params.set("steps", steps.join(","));
      params.set("windowHours", String(clamp(windowHours, FUNNEL_MAX_WINDOW_HOURS)));
      params.set(
        "stepWindowMinutes",
        String(clamp(stepWindowMinutes, FUNNEL_MAX_STEP_WINDOW_MINUTES)),
      );
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router, searchParams, stepWindowMinutes, stepsText, windowHours],
  );

  const onReset = useCallback(() => {
    setStepsText(FUNNEL_DEFAULT_STEPS.join(", "));
    setWindowHours(String(FUNNEL_DEFAULT_WINDOW_HOURS));
    setStepWindowMinutes(String(FUNNEL_DEFAULT_STEP_WINDOW_MINUTES));
    startTransition(() => {
      router.replace(pathname);
    });
  }, [pathname, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">漏斗配置</CardTitle>
        <CardDescription>
          所有配置通过 URL 持久化；复制链接即可分享当前漏斗视图
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_repeat(2,1fr)_auto]"
          onSubmit={onSubmit}
        >
          <div className="space-y-1.5">
            <label htmlFor="funnel-steps" className="text-sm font-medium">
              步骤事件名 · CSV（{FUNNEL_MIN_STEPS}~{FUNNEL_MAX_STEPS} 项）
            </label>
            <input
              id="funnel-steps"
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              placeholder="view_home, click_cta, submit_form"
              spellCheck={false}
              className="border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
            />
            <p
              className={`text-[11px] ${
                stepCountInvalid ? "text-amber-600" : "text-muted-foreground"
              }`}
            >
              当前 {stepCount} 步
              {stepCountInvalid ? "（超出范围，无法查询）" : ""}
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="funnel-window-hours" className="text-sm font-medium">
              窗口（小时）
            </label>
            <input
              id="funnel-window-hours"
              type="number"
              inputMode="numeric"
              min={1}
              max={FUNNEL_MAX_WINDOW_HOURS}
              value={windowHours}
              onChange={(e) => setWindowHours(e.target.value)}
              className="border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
            />
            <p className="text-muted-foreground text-[11px]">
              默认 {FUNNEL_DEFAULT_WINDOW_HOURS}，最大{" "}
              {FUNNEL_MAX_WINDOW_HOURS}（7d）
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="funnel-step-window" className="text-sm font-medium">
              步长（分钟）
            </label>
            <input
              id="funnel-step-window"
              type="number"
              inputMode="numeric"
              min={1}
              max={FUNNEL_MAX_STEP_WINDOW_MINUTES}
              value={stepWindowMinutes}
              onChange={(e) => setStepWindowMinutes(e.target.value)}
              className="border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
            />
            <p className="text-muted-foreground text-[11px]">
              默认 {FUNNEL_DEFAULT_STEP_WINDOW_MINUTES}，最大{" "}
              {FUNNEL_MAX_STEP_WINDOW_MINUTES}（24h）
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium invisible" aria-hidden="true">
              &nbsp;
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={isPending || stepCountInvalid}
                aria-busy={isPending}
              >
                {isPending ? "查询中…" : "查询"}
              </Button>
              <Button type="button" variant="ghost" onClick={onReset}>
                重置
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function clamp(raw: string, max: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return max;
  if (n < 1) return 1;
  if (n > max) return max;
  return n;
}
