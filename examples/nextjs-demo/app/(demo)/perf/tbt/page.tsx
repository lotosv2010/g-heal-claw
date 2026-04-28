"use client";

import { useEffect, useRef, useState } from "react";

/**
 * TBT 场景（Lighthouse · 总阻塞时间）
 *
 * TBT = Σ max(0, longTaskDuration - 50)，窗口为 FCP ~ TTI；本页制造 FCP 后
 * 5 秒内的多个 60~150ms 长任务，让 SDK `observeTBT` 在 load 后 5s 汇总上报。
 *
 * 阈值（Lighthouse）：
 *  - good  ≤ 200ms
 *  - needs ≤ 600ms
 *  - poor  > 600ms
 */
export default function TbtPage() {
  const [burstCount, setBurstCount] = useState(6);
  const [minBlockMs, setMinBlockMs] = useState(60);
  const [maxBlockMs, setMaxBlockMs] = useState(150);
  const [running, setRunning] = useState(true);
  const [tickCount, setTickCount] = useState(0);
  const [accumulatedBlockingMs, setAccumulatedBlockingMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 挂载后 500ms 开始，按间隔连续触发 burst 次 long task；再点击"重新触发"会再来一轮
  useEffect(() => {
    if (!running) return;
    let fired = 0;
    const fireOne = (): void => {
      if (fired >= burstCount) return;
      fired += 1;
      const target =
        minBlockMs + Math.random() * Math.max(0, maxBlockMs - minBlockMs);
      const start = performance.now();
      while (performance.now() - start < target) {
        // 忙等 —— 主线程阻塞 > 50ms 即视为 long task
      }
      const actualDuration = performance.now() - start;
      setTickCount((n) => n + 1);
      setAccumulatedBlockingMs((prev) => prev + Math.max(0, actualDuration - 50));

      // 任务间隔 400ms，总共 ~2.4s 结束，仍在 observeTBT 的 5s 窗口内
      timerRef.current = setTimeout(fireOne, 400);
    };

    timerRef.current = setTimeout(fireOne, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [running, burstCount, minBlockMs, maxBlockMs]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">TBT · 总阻塞时间（Lighthouse）</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        页面挂载后连续触发 <b>{burstCount}</b> 次 <b>{minBlockMs}~{maxBlockMs}ms</b>
        之间的长任务。SDK 的{" "}
        <code className="rounded bg-neutral-200 px-1 py-0.5 text-xs dark:bg-neutral-800">
          observeTBT
        </code>{" "}
        会在 load 后 5 秒将所有{" "}
        <code className="rounded bg-neutral-200 px-1 py-0.5 text-xs dark:bg-neutral-800">
          max(0, duration - 50)
        </code>{" "}
        累加并上报（与 Lighthouse 口径一致）。
      </p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label>数量：</label>
        {[3, 6, 10].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setBurstCount(n)}
            className={`rounded border px-3 py-1 transition ${
              burstCount === n
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-neutral-300 hover:border-neutral-500"
            }`}
          >
            {n}
          </button>
        ))}
        <span className="ml-4" />
        <label>最小阻塞：</label>
        {[60, 100].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setMinBlockMs(n)}
            className={`rounded border px-3 py-1 transition ${
              minBlockMs === n
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-neutral-300 hover:border-neutral-500"
            }`}
          >
            {n}ms
          </button>
        ))}
        <span className="ml-4" />
        <label>最大阻塞：</label>
        {[120, 150, 250].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setMaxBlockMs(n)}
            className={`rounded border px-3 py-1 transition ${
              maxBlockMs === n
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-neutral-300 hover:border-neutral-500"
            }`}
          >
            {n}ms
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setTickCount(0);
            setAccumulatedBlockingMs(0);
            setRunning(false);
            // 下一轮渲染重新启用 effect
            setTimeout(() => setRunning(true), 50);
          }}
          className="rounded border border-blue-600 bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700"
        >
          重新触发 burst
        </button>
        <span className="text-xs text-neutral-500">
          已触发 long task：{tickCount} 次 · 页面估算 TBT：
          <b className="ml-1 text-neutral-700 dark:text-neutral-200">
            {Math.round(accumulatedBlockingMs)}ms
          </b>
        </span>
      </div>

      <div className="rounded border border-neutral-200 p-4 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800">
        <div>· DevTools → Performance 可见多个红色 Long Tasks；</div>
        <div>
          · load 后约 5 秒会出现
          <code className="mx-1 rounded bg-neutral-200 px-1 py-0.5 dark:bg-neutral-800">
            metric=TBT
          </code>
          的 POST（值应接近上方页面估算）；
        </div>
        <div>· 关闭或切走标签页：pagehide 兜底也会触发一次上报。</div>
      </div>
    </section>
  );
}
