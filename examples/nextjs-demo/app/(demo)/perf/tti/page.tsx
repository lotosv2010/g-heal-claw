"use client";

import { useEffect, useRef, useState } from "react";

/**
 * TTI 场景（已废弃 · Google 已停止维护 tti-polyfill）
 *
 * TTI（Time to Interactive）= 从 FCP 起算，第一次出现 ≥5s 长任务静默窗口时，
 * 窗口前最后一次 long task 的结束时间。
 *
 * 本页做法：
 *  1) 挂载后周期性触发 short long-tasks（默认每 1s 一次 100ms 忙等）
 *  2) 由于 long-task 打断了 5s 静默窗口，TTI 无法结算
 *  3) 点击"停止干扰"后主线程空闲，5s 后 SDK 的 observeTTI 结算并上报
 *  4) 也可以直接不停止，等待用户离开页面（pagehide）触发兜底上报
 */
export default function TtiPage() {
  const [intervalMs, setIntervalMs] = useState(1000);
  const [blockMs, setBlockMs] = useState(100);
  const [running, setRunning] = useState(true);
  const [tickCount, setTickCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 停止时清理定时器
    if (!running) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    const id = setInterval(() => {
      const start = performance.now();
      // 忙等循环制造 long task（>50ms 即视为 long task）
      while (performance.now() - start < blockMs) {
        // 空转
      }
      setTickCount((n) => n + 1);
    }, intervalMs);
    timerRef.current = id;
    return () => clearInterval(id);
  }, [running, intervalMs, blockMs]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">
        TTI · 可交互时间 <DeprecatedTag />
      </h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        页面挂载后每 <b>{intervalMs}ms</b> 触发一次 <b>{blockMs}ms</b> 的 long task，
        持续阻止 TTI 静默窗口形成。点击"停止干扰"后静默满 5s，
        SDK 通过 <code className="rounded bg-neutral-200 px-1 py-0.5 text-xs dark:bg-neutral-800">
          longtask
        </code>
        Observer 结算 TTI 并上报。
      </p>
      <p className="text-xs text-amber-600 dark:text-amber-400">
        提示：Google 已停止维护 tti-polyfill；SDK 用 longtask + FCP 近似推导，
        不计入网络 ≤2 请求的静默条件，生产环境偏乐观。
      </p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label>间隔：</label>
        {[500, 1000, 2000].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setIntervalMs(n)}
            className={`rounded border px-3 py-1 transition ${
              intervalMs === n
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-neutral-300 hover:border-neutral-500"
            }`}
          >
            {n}ms
          </button>
        ))}
        <span className="ml-4" />
        <label>阻塞：</label>
        {[60, 100, 200].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setBlockMs(n)}
            className={`rounded border px-3 py-1 transition ${
              blockMs === n
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
          onClick={() => setRunning((v) => !v)}
          className={`rounded border px-4 py-2 text-sm transition ${
            running
              ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
              : "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {running ? "停止干扰（5s 后 TTI 结算）" : "重新开始干扰"}
        </button>
        <span className="text-xs text-neutral-500">
          已触发 long task：{tickCount} 次
        </span>
      </div>

      <div className="rounded border border-neutral-200 p-4 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800">
        <div>
          · 打开 DevTools → Performance 面板录制，可见顶部 Long Tasks 红条；
        </div>
        <div>
          · 停止后观察 Network：5 秒静默窗口完成 → 出现
          <code className="mx-1 rounded bg-neutral-200 px-1 py-0.5 dark:bg-neutral-800">
            metric=TTI
          </code>
          的 POST；
        </div>
        <div>· 若直接关闭/切走标签页，pagehide 兜底也会触发一次上报。</div>
      </div>
    </section>
  );
}

function DeprecatedTag() {
  return (
    <span className="ml-2 inline-flex items-center rounded bg-neutral-200 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
      deprecated
    </span>
  );
}
