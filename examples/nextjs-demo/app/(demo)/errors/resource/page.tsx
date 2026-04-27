"use client";

import { useState } from "react";

/**
 * 静态资源加载失败场景
 *
 * <img> / <script> / <link> 的 error 事件不会冒泡，只能用捕获阶段监听。
 * SDK ErrorPlugin 应通过 window.addEventListener("error", handler, true) 捕获，
 * 并从 event.target.tagName / src 解析上报。
 */
export default function ResourceErrorPage() {
  const [nonce, setNonce] = useState(0);
  const broken = `/__ghc_not_exists__/${nonce}.png`;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Resource 404</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        下方 <code>&lt;img&gt;</code> 指向一个不存在的路径。每次点击"重试"会
        刷新 nonce，重新触发一次 404 & resource error 事件。
      </p>
      <button
        type="button"
        onClick={() => setNonce((n) => n + 1)}
        className="rounded border border-blue-600 bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700"
      >
        重试加载（第 {nonce + 1} 次）
      </button>
      <div className="rounded border border-dashed border-red-400 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={nonce}
          src={broken}
          alt="故意 404 的资源"
          width={120}
          height={80}
          className="rounded border border-neutral-200 dark:border-neutral-800"
        />
        <p className="mt-2 text-xs text-neutral-500 break-all">路径：{broken}</p>
      </div>
    </section>
  );
}
