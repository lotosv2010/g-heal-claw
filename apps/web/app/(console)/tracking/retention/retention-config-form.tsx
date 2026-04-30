"use client";

import { useCallback, useState, useTransition } from "react";
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
  RETENTION_DAYS_MAX,
  RETENTION_DAYS_MIN,
  RETENTION_DEFAULT_COHORT_DAYS,
  RETENTION_DEFAULT_IDENTITY,
  RETENTION_DEFAULT_RETURN_DAYS,
  type RetentionQuery,
} from "@/lib/api/retention";

/**
 * 留存配置表单（URL 驱动 · ADR-0028）
 *
 * 所有状态通过 URL searchParams 持久化，天然可分享；Client Component 仅负责：
 *  1. 维护 cohortDays / returnDays / identity / since / until 的草稿
 *  2. 点击"查询"时 router.replace 写回 URL，触发 Server Component 重新抓数
 *
 * 不做运行时校验提示（Server 侧 Zod 兜底），仅做最小夹紧（1~30）。
 */
export function RetentionConfigForm({ initial }: { initial: RetentionQuery }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [cohortDays, setCohortDays] = useState(String(initial.cohortDays));
  const [returnDays, setReturnDays] = useState(String(initial.returnDays));
  const [identity, setIdentity] = useState(initial.identity);
  const [since, setSince] = useState(initial.since ?? "");
  const [until, setUntil] = useState(initial.until ?? "");

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const params = new URLSearchParams(searchParams?.toString());
      params.set(
        "cohortDays",
        String(clamp(cohortDays, RETENTION_DAYS_MIN, RETENTION_DAYS_MAX)),
      );
      params.set(
        "returnDays",
        String(clamp(returnDays, RETENTION_DAYS_MIN, RETENTION_DAYS_MAX)),
      );
      params.set("identity", identity);
      if (since) params.set("since", since);
      else params.delete("since");
      if (until) params.set("until", until);
      else params.delete("until");
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [cohortDays, identity, pathname, returnDays, router, searchParams, since, until],
  );

  const onReset = useCallback(() => {
    setCohortDays(String(RETENTION_DEFAULT_COHORT_DAYS));
    setReturnDays(String(RETENTION_DEFAULT_RETURN_DAYS));
    setIdentity(RETENTION_DEFAULT_IDENTITY);
    setSince("");
    setUntil("");
    startTransition(() => {
      router.replace(pathname);
    });
  }, [pathname, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">留存配置</CardTitle>
        <CardDescription>
          所有配置通过 URL 持久化；复制链接即可分享当前留存视图
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(2,1fr)_1fr_1fr_1fr_auto]"
          onSubmit={onSubmit}
        >
          <div className="space-y-1.5">
            <label htmlFor="retention-cohort-days" className="text-sm font-medium">
              Cohort 天数
            </label>
            <input
              id="retention-cohort-days"
              type="number"
              inputMode="numeric"
              min={RETENTION_DAYS_MIN}
              max={RETENTION_DAYS_MAX}
              value={cohortDays}
              onChange={(e) => setCohortDays(e.target.value)}
              className="border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
            />
            <p className="text-muted-foreground text-[11px]">
              最近 N 天新用户纳入 cohort（1~{RETENTION_DAYS_MAX}）
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="retention-return-days" className="text-sm font-medium">
              观察天数
            </label>
            <input
              id="retention-return-days"
              type="number"
              inputMode="numeric"
              min={RETENTION_DAYS_MIN}
              max={RETENTION_DAYS_MAX}
              value={returnDays}
              onChange={(e) => setReturnDays(e.target.value)}
              className="border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
            />
            <p className="text-muted-foreground text-[11px]">
              day 0 ~ day N（1~{RETENTION_DAYS_MAX}）
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="retention-identity" className="text-sm font-medium">
              身份维度
            </label>
            <select
              id="retention-identity"
              value={identity}
              onChange={(e) =>
                setIdentity(e.target.value as RetentionQuery["identity"])
              }
              className="border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
            >
              <option value="session">session</option>
              <option value="user">user（user_id 优先）</option>
            </select>
            <p className="text-muted-foreground text-[11px]">
              user = COALESCE(user_id, session_id)
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="retention-since" className="text-sm font-medium">
              起始时间（可选）
            </label>
            <input
              id="retention-since"
              type="datetime-local"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
            />
            <p className="text-muted-foreground text-[11px]">
              留空则以 until 反推
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="retention-until" className="text-sm font-medium">
              结束时间（可选）
            </label>
            <input
              id="retention-until"
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
            />
            <p className="text-muted-foreground text-[11px]">留空则 now</p>
          </div>

          <div className="flex items-end gap-2">
            <Button type="submit" disabled={isPending} aria-busy={isPending}>
              {isPending ? "查询中…" : "查询"}
            </Button>
            <Button type="button" variant="ghost" onClick={onReset}>
              重置
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function clamp(raw: string, min: number, max: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
