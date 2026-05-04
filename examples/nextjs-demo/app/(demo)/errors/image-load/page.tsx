"use client";

import { useState } from "react";

/**
 * 图片加载失败（subType=resource, resource_kind=image_load）场景
 *
 * 渲染指向 404 路径的 <img>；浏览器触发 element.error，ErrorPlugin 捕获并按
 * tagName/url 后缀分类为 image_load。
 */
export default function ImageLoadPage() {
  const [nonce, setNonce] = useState(0);
  const broken = `/__ghc_not_exists__/${nonce}.png`;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">图片加载失败</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        指向不存在的 PNG 路径；resource_kind = image_load，归类到 9 分类卡片
        「图片加载异常」。
      </p>
      <button
        type="button"
        onClick={() => setNonce((n) => n + 1)}
        className="rounded border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm text-white transition hover:bg-emerald-700"
      >
        刷新（第 {nonce + 1} 次）
      </button>
      <div className="rounded border border-dashed border-emerald-400 p-4">
        <img
          key={nonce}
          src={broken}
          alt="故意 404 的图片"
          width={120}
          height={80}
          className="rounded border border-neutral-200 dark:border-neutral-800"
        />
        <p className="mt-2 text-xs text-neutral-500 break-all">路径：{broken}</p>
      </div>
    </section>
  );
}
