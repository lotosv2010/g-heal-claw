"use client";

import { useState } from "react";

/**
 * JS 加载失败（subType=resource, resource_kind=js_load）场景
 *
 * 动态插入一个指向不存在路径的 <script>，浏览器触发 element.error 事件，
 * ErrorPlugin 在捕获阶段拦截并按 tagName 分类为 resource_kind=js_load。
 */
export default function JsLoadPage() {
  const [count, setCount] = useState(0);

  const fireJsLoadError = (): void => {
    const nonce = Date.now();
    const url = `/__ghc_not_exists__/${nonce}.js`;
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.onerror = () => {
      // eslint-disable-next-line no-console
      console.info(`[demo] script 加载失败：${url}`);
    };
    document.head.appendChild(s);
    setCount((n) => n + 1);
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">JS 加载失败</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        动态插入一个不存在的 <code>&lt;script&gt;</code>，触发一次 resource
        error；resource_kind = js_load，归类到 9 分类卡片「JS 加载异常」。
      </p>
      <button
        type="button"
        onClick={fireJsLoadError}
        className="rounded border border-violet-600 bg-violet-600 px-4 py-2 text-sm text-white transition hover:bg-violet-700"
      >
        加载一个 404 script
      </button>
      <p className="text-xs text-neutral-500">已触发 {count} 次</p>
    </section>
  );
}
