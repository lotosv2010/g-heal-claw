"use client";

import { useState } from "react";

/**
 * 未处理的 Promise rejection 场景
 *
 * 不带 .catch() 的 Promise rejection 会触发 window.unhandledrejection。
 * SDK ErrorPlugin（T1.2.2）应监听该事件并上报为 errorType=unhandledrejection。
 */
export default function PromiseErrorPage() {
  const [count, setCount] = useState(0);

  const rejectWithoutCatch = () => {
    setCount((n) => n + 1);
    // 有意不 catch，触发 unhandledrejection
    void Promise.reject(new Error(`[demo] 未处理的 rejection #${count + 1}`));
  };

  const rejectAsync = async () => {
    setCount((n) => n + 1);
    // async 函数内 throw 等价于返回 rejected Promise；调用方不 await 就成为未处理
    const run = async () => {
      throw new Error(`[demo] async throw #${count + 1}`);
    };
    run();
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Promise Reject</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        两种触发方式均依赖 <code>window.addEventListener("unhandledrejection")</code>。
        若 SDK 已注册 ErrorPlugin，应能在 Network 面板看到事件上报。
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={rejectWithoutCatch}
          className="rounded border border-red-600 bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-700"
        >
          Promise.reject 不 catch
        </button>
        <button
          type="button"
          onClick={rejectAsync}
          className="rounded border border-amber-600 bg-amber-600 px-4 py-2 text-sm text-white transition hover:bg-amber-700"
        >
          async throw 无 await
        </button>
      </div>
      <p className="text-xs text-neutral-500">已触发 {count} 次</p>
    </section>
  );
}
