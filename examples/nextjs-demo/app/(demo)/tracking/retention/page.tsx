"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 用户留存触发场景（ADR-0028 / tracking/retention）
 *
 * 留存大盘消费 `page_view_raw`：每次页面进入都会由 pageViewPlugin 自动上报。
 * 本场景提供 3 类触发器，验证 `session` 身份维度下 cohort 矩阵的构建：
 *
 *  1. 硬刷新当前页 → 新的 load_type=reload，session_id 不变
 *  2. SPA 导航到其他 demo 页 → load_type=navigate + is_spa_nav=true
 *  3. 重置 session（清 localStorage）+ 硬刷新 → 产生全新 session_id 的 cohort
 *
 * 验证路径：
 *  1. 打开 DevTools → Network → `/ingest/v1/events` 看 type:page_view
 *  2. 后台访问 `/tracking/retention?cohortDays=7&returnDays=7&identity=session`
 *  3. 今天触发的 session 落在 day 0 留存（retentionByDay[0] = 1）
 *  4. **多天 cohort 需要真实历史数据或跨日触发**；快速验证可用 psql 造数脚本：
 *     见 examples/nextjs-demo/README.md #留存造数（最近 3 天 3 cohort × 3 用户）
 *
 * 关联：apps/docs/docs/guide/dashboard/tracking-retention.mdx
 */
export default function TrackingRetentionDemo() {
  const router = useRouter();
  const [log, setLog] = useState<readonly string[]>([]);
  const append = (line: string) =>
    setLog((prev) =>
      [`${new Date().toLocaleTimeString()} · ${line}`, ...prev].slice(0, 8),
    );

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">用户留存触发器</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          留存大盘消费 <code>page_view_raw</code>，每次页面进入都会自动上报（pageViewPlugin）。
          多天 cohort 建议结合 <code>README.md</code> 里的 psql 造数脚本快速验证。
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            append("硬刷新 · load_type=reload");
            window.location.reload();
          }}
          className="rounded border border-emerald-600 bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          硬刷新当前页（reload）
        </button>

        <button
          type="button"
          onClick={() => {
            append("SPA 导航 → /tracking/click");
            router.push("/tracking/click");
          }}
          className="rounded border border-violet-600 bg-violet-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-700"
        >
          SPA 导航到 click 场景
        </button>

        <Link
          href="/visits/page-view"
          onClick={() => append("SPA 导航 → /visits/page-view")}
          className="rounded border border-violet-400 bg-white px-4 py-3 text-center text-sm text-violet-700 transition dark:bg-neutral-900 dark:text-violet-300"
        >
          SPA 导航到 PageView 场景
        </Link>

        <button
          type="button"
          onClick={() => {
            try {
              // session_id 由 SDK 存在 localStorage（ghc_session_id 键名见 SDK 源码）
              Object.keys(localStorage)
                .filter((k) => k.toLowerCase().includes("ghc"))
                .forEach((k) => localStorage.removeItem(k));
              append("已清除 ghc_* localStorage，下次刷新将产生新 session_id");
            } catch (err) {
              append(`清除失败：${(err as Error).message}`);
            }
          }}
          className="rounded border border-rose-500 bg-rose-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-rose-600"
        >
          重置 session（清 ghc_* localStorage）
        </button>
      </div>

      <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 p-4 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-400">
        <p>
          <b>提示</b>：留存矩阵以 UTC 日粒度切桶，相同 session 在同一 UTC 日的多次 page_view 只计 1 次 cohort。
        </p>
        <p className="mt-2">
          <b>identity=user</b>（URL 切换）当前依赖 <code>page_view_raw.user_id</code> 列；如未迁移该列则会触发 source=error 兜底，建议默认留在 <code>identity=session</code>。
        </p>
      </div>

      {log.length > 0 ? (
        <pre className="rounded bg-neutral-900 p-3 text-xs leading-relaxed text-neutral-100 dark:bg-neutral-950">
          {log.join("\n")}
        </pre>
      ) : null}
    </section>
  );
}
