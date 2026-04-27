"use client";

import { useState } from "react";

/**
 * 同步异常场景
 *
 * 在 React 事件回调中直接 throw，会冒泡到 React 的错误边界 / window.onerror。
 * 若 SDK 已注册 ErrorPlugin（T1.2.2），会由 window.onerror 捕获并上报；
 * 本页同时演示通过 GHealClaw.captureException 的手动上报路径。
 */
export default function SyncErrorPage() {
  const [count, setCount] = useState(0);

  const throwSync = () => {
    setCount((n) => n + 1);
    throw new Error(`[demo] 手动触发的同步异常 #${count + 1}`);
  };

  const captureManual = () => {
    setCount((n) => n + 1);
    try {
      // 故意制造一个错误，用于演示手动 captureException 路径
      const obj: { readonly value?: string } = {};
      if (!obj.value) throw new Error(`[demo] 手动 capture 的异常 #${count + 1}`);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sdk = (globalThis as any).GHealClaw;
      if (sdk?.captureException) {
        sdk.captureException(err);
      } else {
        // eslint-disable-next-line no-console
        console.warn("[demo] GHealClaw.captureException 未就绪，错误仅打印：", err);
      }
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Sync Throw</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        两种触发方式：直接 throw（依赖 window.onerror 兜底）与手动 captureException。
        打开 DevTools 观察控制台与网络请求 <code>/ingest/v1/events</code>。
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={throwSync}
          className="rounded border border-red-600 bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-700"
        >
          直接 throw（全局捕获）
        </button>
        <button
          type="button"
          onClick={captureManual}
          className="rounded border border-amber-600 bg-amber-600 px-4 py-2 text-sm text-white transition hover:bg-amber-700"
        >
          手动 captureException
        </button>
      </div>
      <p className="text-xs text-neutral-500">已触发 {count} 次</p>
    </section>
  );
}
