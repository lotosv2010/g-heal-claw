"use client";

import { useState } from "react";

/**
 * CSS 加载失败（subType=resource, resource_kind=css_load）场景
 *
 * 动态插入一个指向不存在路径的 <link rel="stylesheet">，触发一次 resource error；
 * 由于 link 标签 error 不冒泡，ErrorPlugin 在捕获阶段拦截并按 tagName=LINK
 * 分类为 css_load。
 */
export default function CssLoadPage() {
  const [count, setCount] = useState(0);

  const fireCssLoadError = (): void => {
    const nonce = Date.now();
    const href = `/__ghc_not_exists__/${nonce}.css`;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onerror = () => {
      console.info(`[demo] stylesheet 加载失败：${href}`);
    };
    document.head.appendChild(link);
    setCount((n) => n + 1);
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">CSS 加载失败</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        动态插入一个不存在的 <code>&lt;link rel=&quot;stylesheet&quot;&gt;</code>，
        触发一次 resource error；resource_kind = css_load。
      </p>
      <button
        type="button"
        onClick={fireCssLoadError}
        className="rounded border border-blue-600 bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700"
      >
        加载一个 404 stylesheet
      </button>
      <p className="text-xs text-neutral-500">已触发 {count} 次</p>
    </section>
  );
}
