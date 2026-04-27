"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Layout Shift 场景：延迟插入无尺寸元素，推动下方内容偏移
 *
 * CLS 判定：同一会话内，未由用户交互触发的布局偏移面积占比累加。
 * 触发方式：点击"触发 CLS"后 500ms 插入一块未预留高度的广告位，
 * 下方文本会被顶下去，web-vitals 会把这次偏移计入 CLS。
 */
export default function LayoutShiftPage() {
  const [shifted, setShifted] = useState(false);
  const [hits, setHits] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const trigger = () => {
    setHits((n) => n + 1);
    setShifted(false);
    timerRef.current = setTimeout(() => setShifted(true), 500);
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Layout Shift → CLS</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        点击下方按钮，500ms 后会插入一块未预留占位的面板，导致下方内容被推动；
        多次触发累加 CLS 值，离开页面（visibilitychange=hidden）时 SDK 会上报最终 CLS。
      </p>
      <button
        type="button"
        onClick={trigger}
        className="rounded border border-blue-600 bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700"
      >
        触发 CLS（已触发 {hits} 次）
      </button>

      {shifted ? (
        <div className="rounded border border-amber-400 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200">
          这是延迟插入的广告位（未预留高度）。它把下方锚点往下顶，从而产生布局偏移。
        </div>
      ) : null}

      <article className="space-y-2 text-sm leading-6 text-neutral-700 dark:text-neutral-300">
        <p>
          下方这段文字就是"锚点"：当上方插入新元素时，这段文字会发生位置变化。
          web-vitals 通过 PerformanceObserver({"{"}type: "layout-shift"{"}"}) 捕获
          layoutShiftEntry.value 累加得到本次会话 CLS。
        </p>
        <p>
          注意：用户交互（点击、输入、滚动）后 500ms 内触发的偏移会被标记为
          hadRecentInput，不计入 CLS；因此本页通过 setTimeout 500ms 故意绕开此窗口。
        </p>
      </article>
    </section>
  );
}
