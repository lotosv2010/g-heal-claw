"use client";

import { useState } from "react";

/**
 * 实时监控驱动场景（ADR-0030）
 *
 * 目的：在后台「Dashboard → 实时监控」侧边观察 SSE 推送；
 * 本页 3 个按钮分别触发 error / api / perf 三个 topic 的样本事件。
 *
 * 验证路径：
 *  - 在同源 3000 端口打开 /dashboard/realtime（后台）并保持滚动
 *  - 点击按钮后，实时大盘 LiveFeed 应在 1s 内出现新行
 *  - DevTools → Network → EventStream 可查看底层 SSE 帧
 *
 * 与 ADR-0030 联动；apps/docs 使用说明：/guide/dashboard/realtime
 */
export default function DashboardRealtimeDemo() {
  const [log, setLog] = useState<readonly string[]>([]);
  const append = (line: string) =>
    setLog((prev) =>
      [`${new Date().toLocaleTimeString()} · ${line}`, ...prev].slice(0, 12),
    );

  const triggerError = () => {
    append("error：触发一次 unhandled rejection");
    void Promise.reject(
      new Error("[demo] realtime unhandled reject @" + Date.now()),
    );
  };

  const triggerApi = async () => {
    append("api：发一次成功 fetch + 一次 500 fetch");
    try {
      await fetch("/api/echo?case=realtime");
    } catch {
      /* ignore */
    }
    try {
      await fetch("/api/echo?case=realtime-500&status=500");
    } catch {
      /* ignore */
    }
  };

  const triggerPerf = () => {
    append("perf：重载慢图 → 触发 LCP 重采样");
    const img = new Image();
    img.src = `https://picsum.photos/seed/rt-${Date.now()}/1600/900`;
    img.style.width = "100%";
    img.style.maxHeight = "360px";
    img.style.objectFit = "cover";
    document.getElementById("demo-lcp-slot-rt")?.replaceChildren(img);
  };

  const triggerAll = async () => {
    triggerError();
    await triggerApi();
    triggerPerf();
    append("三 topic 样本均已触发，回看大盘应出现 3 行新事件");
  };

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">实时监控触发器</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          本页按钮触发 error / api / perf 样本，驱动后台「Dashboard → 实时监控」
          SSE 大盘 LiveFeed 实时刷新。验证地址：
          <a
            href="http://localhost:3000/dashboard/realtime"
            target="_blank"
            rel="noreferrer"
            className="ml-1 text-emerald-700 underline dark:text-emerald-300"
          >
            /dashboard/realtime
          </a>
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={triggerError}
          className="rounded border border-rose-500 bg-rose-500 px-4 py-3 text-sm text-white"
        >
          触发 error（unhandled reject）
        </button>
        <button
          type="button"
          onClick={triggerApi}
          className="rounded border border-blue-500 bg-blue-500 px-4 py-3 text-sm text-white"
        >
          触发 api（200 + 500）
        </button>
        <button
          type="button"
          onClick={triggerPerf}
          className="rounded border border-emerald-500 bg-emerald-500 px-4 py-3 text-sm text-white"
        >
          触发 perf（LCP 慢图）
        </button>
        <button
          type="button"
          onClick={triggerAll}
          className="rounded border border-neutral-700 bg-neutral-800 px-4 py-3 text-sm text-white"
        >
          一键全部
        </button>
      </div>

      <div
        id="demo-lcp-slot-rt"
        className="min-h-[120px] rounded border border-dashed border-neutral-300 bg-neutral-50 p-2 text-xs text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
      >
        LCP 容器 · 点击"触发 perf"后插入慢图
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
