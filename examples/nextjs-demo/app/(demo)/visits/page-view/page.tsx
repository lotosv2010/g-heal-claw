"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * PageView 页面访问演示场景
 *
 * 触发规则（由 pageViewPlugin 采集）：
 *  - 硬刷新：detectLoadType 读 Performance Navigation → loadType = "reload"
 *  - SPA 导航：Link / router.push 触发 pushState，patch 后 isSpaNav=true + loadType="navigate"
 *  - 后退前进：popstate 监听 → loadType = "back_forward"
 *
 * 验证路径：
 *  - DevTools → Network → /ingest/v1/events 载荷 type=page_view
 *  - 后台「监控 → 页面访问」PV / UV / SPA占比 / 刷新占比 / TopPages / TopReferrers
 *
 * 参考 ADR-0020 Tier 2.A
 */
export default function VisitsPageViewDemo() {
  const router = useRouter();
  const [log, setLog] = useState<readonly string[]>([]);
  const append = (line: string) =>
    setLog((prev) =>
      [`${new Date().toLocaleTimeString()} · ${line}`, ...prev].slice(0, 8),
    );

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">PageView 页面访问</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          打开 DevTools → Network，观察 <code className="mx-1 rounded bg-neutral-200 px-1 py-0.5 text-xs dark:bg-neutral-800">/ingest/v1/events</code>
          中 <code>type: &quot;page_view&quot;</code> 载荷。后台「监控 → 页面访问」会实时聚合 PV / UV / SPA 占比 / 刷新占比。
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            append("SPA 导航：router.push(/tracking/click)");
            router.push("/tracking/click");
          }}
          className="rounded border border-violet-500 bg-violet-500 px-4 py-3 text-sm text-white"
        >
          SPA 导航（router.push）
        </button>

        <Link
          href="/tracking/expose"
          onClick={() => append("SPA 导航：<Link href=/tracking/expose>")}
          className="rounded border border-violet-400 bg-white px-4 py-3 text-center text-sm text-violet-700 dark:bg-neutral-900 dark:text-violet-300"
        >
          SPA 导航（Next Link）
        </Link>

        <button
          type="button"
          onClick={() => {
            append("硬刷新：location.reload() → loadType=reload");
            if (typeof window !== "undefined") window.location.reload();
          }}
          className="rounded border border-amber-500 bg-amber-500 px-4 py-3 text-sm text-white"
        >
          硬刷新（reload）
        </button>

        <button
          type="button"
          onClick={() => {
            append("history.back() → popstate + loadType=back_forward");
            if (typeof window !== "undefined") window.history.back();
          }}
          className="rounded border border-neutral-400 bg-white px-4 py-3 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          后退（history.back）
        </button>
      </div>

      <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
        <div className="mb-1 font-medium text-neutral-500">
          本地操作日志（最近 8 条）
        </div>
        {log.length === 0 ? (
          <div className="text-neutral-400">尚未触发</div>
        ) : (
          <ul className="space-y-0.5 font-mono">
            {log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
