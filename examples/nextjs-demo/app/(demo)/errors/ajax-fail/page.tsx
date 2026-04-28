"use client";

import { useState } from "react";

/**
 * Ajax 失败（subType=ajax）场景
 *
 * 由 httpPlugin 的 fetch / XHR monkey patch 自动采集：
 *  - 触发非 2xx 响应 → 上报 ajax
 *  - 触发 fetch 抛错 / XHR onerror → 上报 ajax（status=0）
 */
export default function AjaxFailPage() {
  const [count, setCount] = useState(0);

  const fetch404 = async (): Promise<void> => {
    setCount((n) => n + 1);
    try {
      await fetch("/__ghc_ajax_not_found__/404", { method: "GET" });
    } catch (err) {
      console.warn("[demo] fetch 404 exception:", err);
    }
  };

  const fetchNetworkError = async (): Promise<void> => {
    setCount((n) => n + 1);
    try {
      // 目标域名不可达：fetch 会抛出 TypeError
      await fetch("https://__ghc_non_existent_host__.invalid/boom");
    } catch (err) {
      console.warn("[demo] fetch network error:", (err as Error).message);
    }
  };

  const xhr500 = (): void => {
    setCount((n) => n + 1);
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/__ghc_xhr_500__/boom");
    xhr.send();
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Ajax 异常</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        httpPlugin 自动捕获 fetch / XHR 的非 2xx 或网络失败；事件 subType=ajax，
        归类到 9 分类卡片「Ajax 异常」。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={fetch404}
          className="rounded border border-orange-600 bg-orange-600 px-4 py-2 text-sm text-white transition hover:bg-orange-700"
        >
          fetch 404
        </button>
        <button
          type="button"
          onClick={fetchNetworkError}
          className="rounded border border-orange-700 bg-orange-700 px-4 py-2 text-sm text-white transition hover:bg-orange-800"
        >
          fetch 网络不可达
        </button>
        <button
          type="button"
          onClick={xhr500}
          className="rounded border border-orange-800 bg-orange-800 px-4 py-2 text-sm text-white transition hover:bg-orange-900"
        >
          XHR 5xx
        </button>
      </div>
      <p className="text-xs text-neutral-500">已触发 {count} 次</p>
    </section>
  );
}
