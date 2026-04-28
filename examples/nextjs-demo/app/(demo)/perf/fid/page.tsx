"use client";

import { useEffect, useState } from "react";

/**
 * FID 场景（已废弃 · 已被 INP 取代）
 *
 * FID（First Input Delay）= 用户首次交互到浏览器开始处理该事件的延迟。
 * 关键点：必须在"首次输入"前制造主线程拥塞，input 被 pending → 延迟变高。
 *
 * 本页做法：
 *  1) 挂载后立即开始一次长循环（忙等 1.5s），这段时间内主线程被占用
 *  2) 引导用户在这 1.5s 窗口内尽快点击"Click me"按钮
 *  3) 浏览器把 pointerdown 排队到主线程空闲后才处理 → 产生显著 FID
 *  4) SDK 的 observeFID 通过 PerformanceObserver({type:'first-input'}) 捕获并上报
 */
export default function FidPage() {
  const [status, setStatus] = useState<
    "idle" | "blocking" | "done"
  >("idle");
  const [blockMs, setBlockMs] = useState(1500);
  const [clickedAt, setClickedAt] = useState<number | null>(null);

  // 挂载后立即制造一次长循环；只跑一次
  useEffect(() => {
    // 下一个 tick 再阻塞，确保 React 把按钮渲染上屏
    const id = requestAnimationFrame(() => {
      setStatus("blocking");
      const start = performance.now();
      // 忙等循环：主线程被占用，用户点击只能排队
      while (performance.now() - start < blockMs) {
        // 空转
      }
      setStatus("done");
    });
    return () => cancelAnimationFrame(id);
    // 只在挂载时运行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = () => {
    setClickedAt(Math.round(performance.now()));
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">
        FID · 首次输入延迟 <DeprecatedTag />
      </h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        打开页面后主线程会被阻塞 <b>{blockMs}ms</b>。请在这段时间内<strong>立刻</strong>
        点击下方按钮——浏览器会把 pointerdown 排队，产生一次显著的 FID（通常 &gt;200ms）。
      </p>
      <p className="text-xs text-amber-600 dark:text-amber-400">
        提示：FID 仅采集"首次"输入；本页刷新后才能重新复现。
        web-vitals v4 已移除该指标，SDK 通过原生
        <code className="mx-1 rounded bg-neutral-200 px-1 py-0.5 dark:bg-neutral-800">
          PerformanceObserver
        </code>
        兼容采集。
      </p>

      <div className="flex items-center gap-2 text-sm">
        <label>阻塞时长（刷新生效）：</label>
        {[500, 1500, 3000].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setBlockMs(n)}
            disabled={status !== "idle"}
            className={`rounded border px-3 py-1 transition disabled:opacity-50 ${
              blockMs === n
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
        onClick={handleClick}
        className="rounded border border-red-600 bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-700"
      >
        Click me（在阻塞窗口内点击以触发 FID）
      </button>

      <StatusLine status={status} />

      {clickedAt !== null ? (
        <div className="rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <div className="font-medium">点击已记录</div>
          <div className="mt-1 text-xs text-neutral-500">
            相对导航开始：{clickedAt} ms · 打开 DevTools → Network 查看
            <code className="mx-1 rounded bg-neutral-200 px-1 py-0.5 text-xs dark:bg-neutral-800">
              metric=FID
            </code>
            的 POST
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StatusLine({ status }: { status: "idle" | "blocking" | "done" }) {
  const text =
    status === "idle"
      ? "状态：准备中…"
      : status === "blocking"
        ? "状态：主线程阻塞中（现在就点击按钮！）"
        : "状态：阻塞结束；如尚未点击，刷新页面重新触发";
  const tone =
    status === "blocking"
      ? "text-red-600 dark:text-red-400"
      : "text-neutral-500";
  return <div className={`text-xs ${tone}`}>{text}</div>;
}

function DeprecatedTag() {
  return (
    <span className="ml-2 inline-flex items-center rounded bg-neutral-200 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
      deprecated
    </span>
  );
}
