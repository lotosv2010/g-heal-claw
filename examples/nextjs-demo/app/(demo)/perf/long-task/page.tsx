"use client";

import { useState } from "react";

/**
 * Long Task 场景：阻塞主线程制造高 INP
 *
 * INP（Interaction to Next Paint）：从用户交互到浏览器下一次绘制的延迟。
 * 本页点击按钮后同步跑一个忙等循环，主线程被占用 ms 级；web-vitals 会把
 * 整个 pointerdown → next paint 的延迟当作一次 interaction。多次交互取 p98。
 */
export default function LongTaskPage() {
  const [ms, setMs] = useState(300);
  const [runs, setRuns] = useState<ReadonlyArray<number>>([]);

  const block = () => {
    const start = performance.now();
    // 故意用忙等循环阻塞主线程，不能用 setTimeout（那不会阻塞 INP）
    while (performance.now() - start < ms) {
      // 空转
    }
    const elapsed = Math.round(performance.now() - start);
    setRuns((prev) => [elapsed, ...prev].slice(0, 8));
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Long Task → INP</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        点击下方按钮会同步阻塞主线程 {ms}ms，造成一次高延迟交互。
        多点几次后切走标签页，SDK 会把本次会话 INP（通常取 p98）上报。
      </p>
      <div className="flex items-center gap-2 text-sm">
        <label>阻塞时长：</label>
        {[100, 300, 800, 2000].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setMs(n)}
            className={`rounded border px-3 py-1 transition ${
              ms === n
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-neutral-300 hover:border-neutral-500"
            }`}
          >
            {n}ms
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={block}
        className="rounded border border-red-600 bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-700"
      >
        阻塞主线程
      </button>
      {runs.length > 0 ? (
        <div className="rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <div className="mb-2 font-medium">最近 {runs.length} 次实测阻塞时长：</div>
          <ul className="space-y-1 font-mono text-xs">
            {runs.map((v, i) => (
              <li key={i}>#{runs.length - i}: {v}ms</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
