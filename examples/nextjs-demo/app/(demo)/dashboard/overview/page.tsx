"use client";

import { useState } from "react";

/**
 * 数据总览驱动场景（ADR-0029）
 *
 * 目的：一页触发 5 域（errors / performance / api / resources / visits）样本，
 * 让后台 `/dashboard/overview` 的健康度、5 张域卡从 `empty` 切到 `live`。
 *
 * 验证路径：
 *  - DevTools → Network → /ingest/v1/events 依次出现多种 type
 *  - 后台「数据总览」HealthHeroCard 的 score / tone 实时刷新；刷新页面查看环比
 *
 * 与 ADR-0020 Tier 3 联动；apps/docs 使用说明：/guide/dashboard/overview
 */
export default function DashboardOverviewDemo() {
  const [log, setLog] = useState<readonly string[]>([]);
  const append = (line: string) =>
    setLog((prev) =>
      [`${new Date().toLocaleTimeString()} · ${line}`, ...prev].slice(0, 12),
    );

  const triggerErrors = () => {
    append("errors：sync throw × 1 + unhandled rejection × 1");
    setTimeout(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (undefined as any).oops();
      } catch (e) {
        // 抛回事件循环，让 window.error 捕获
        setTimeout(() => {
          throw e;
        }, 0);
      }
    }, 0);
    // 未处理的 promise rejection
    void Promise.reject(new Error("[demo] unhandled reject for overview"));
  };

  const triggerApi = async () => {
    append("api：fetch 200 + fetch 500");
    try {
      await fetch("/api/echo?case=overview");
    } catch {
      /* ignore */
    }
    try {
      await fetch("/api/echo?case=overview-500&status=500");
    } catch {
      /* ignore */
    }
  };

  const triggerPerf = () => {
    append("perf：主动插入 5s 慢图 → 触发 resource 采集 + LCP 漂移");
    const img = new Image();
    // 一个较慢的 LCP 候选图像
    img.src = `https://picsum.photos/seed/${Date.now()}/1600/900`;
    img.style.width = "100%";
    img.style.maxHeight = "360px";
    img.style.objectFit = "cover";
    document.getElementById("demo-lcp-slot")?.replaceChildren(img);
  };

  const triggerAll = async () => {
    triggerErrors();
    await triggerApi();
    triggerPerf();
    append("已触发全部 5 域样本，返回后台刷新总览页面");
  };

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">数据总览触发器</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          本页一键触发 errors / api / resources / performance / visits 五域样本，
          驱动后台「Dashboard → 数据总览」HealthHeroCard + 5 张域汇总卡从空样本
          切换为 live。验证地址：
          <a
            href="http://localhost:3000/dashboard/overview"
            target="_blank"
            rel="noreferrer"
            className="ml-1 text-emerald-700 underline dark:text-emerald-300"
          >
            /dashboard/overview
          </a>
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={triggerErrors}
          className="rounded border border-amber-500 bg-amber-500 px-4 py-3 text-sm text-white"
        >
          触发 errors（js + promise）
        </button>
        <button
          type="button"
          onClick={triggerApi}
          className="rounded border border-indigo-500 bg-indigo-500 px-4 py-3 text-sm text-white"
        >
          触发 api（200 + 500）
        </button>
        <button
          type="button"
          onClick={triggerPerf}
          className="rounded border border-teal-500 bg-teal-500 px-4 py-3 text-sm text-white"
        >
          触发 resources + LCP
        </button>
        <button
          type="button"
          onClick={triggerAll}
          className="rounded border border-emerald-500 bg-emerald-500 px-4 py-3 text-sm text-white"
        >
          一键全部（推荐）
        </button>
      </div>

      <div
        id="demo-lcp-slot"
        className="min-h-[120px] rounded border border-dashed border-neutral-300 bg-neutral-50 p-2 text-xs text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
      >
        LCP 容器 · 点击"触发 resources + LCP"后插入慢图
      </div>

      <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
        <div className="mb-1 font-medium text-neutral-500">
          本地操作日志（最近 12 条）
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
