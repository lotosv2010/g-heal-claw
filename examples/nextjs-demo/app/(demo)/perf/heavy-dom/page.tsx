"use client";

import { useMemo, useState } from "react";

/**
 * Heavy DOM 场景：一次性渲染 N 个节点
 *
 * 目的：把 FCP / LCP 从"快"推向"慢"，验证 rating 从 good → warn/destructive 的切换。
 * 额外开销：CSS 深层嵌套 + 文本节点，确保 Layout 时间真实增加。
 */
export default function HeavyDomPage() {
  const [count, setCount] = useState(2000);
  const items = useMemo(
    () => Array.from({ length: count }, (_, i) => i),
    [count],
  );

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Heavy DOM ({count.toLocaleString()} 节点)</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        改变数量后刷新页面（F5）才会生成新的 LCP 候选。切回到其他标签页或关闭会触发
        visibilitychange=hidden，SDK 才会最终上报 LCP / INP / CLS。
      </p>
      <div className="flex items-center gap-2 text-sm">
        <label>节点数：</label>
        {[500, 2000, 5000, 10000].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setCount(n)}
            className={`rounded border px-3 py-1 transition ${
              count === n
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-neutral-300 hover:border-neutral-500"
            }`}
          >
            {n.toLocaleString()}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-10 gap-px rounded border border-neutral-200 bg-neutral-200 p-px dark:border-neutral-800 dark:bg-neutral-800">
        {items.map((i) => (
          <div
            key={i}
            className="flex h-6 items-center justify-center bg-white text-[10px] text-neutral-500 dark:bg-neutral-900"
          >
            {i}
          </div>
        ))}
      </div>
    </section>
  );
}
