"use client";

import { GHealClaw } from "@g-heal-claw/sdk";
import { useState } from "react";

/**
 * 白屏（white_screen）场景
 *
 * 真实白屏通常由路由挂载失败 / 根节点未渲染触发，生产环境可通过健康探针检测。
 * Demo 侧采用"手动上报"路径模拟：调用 <code>GHealClaw.captureException</code>
 *（ESM 具名导入的命名空间对象，自动解析当前 Hub）并显式指定
 * subType = "white_screen"，触发一次 error 事件（category = white_screen）。
 */
export default function WhiteScreenPage() {
  const [count, setCount] = useState(0);

  const fireWhiteScreen = (): void => {
    setCount((n) => n + 1);
    const err = new Error(`[demo] 白屏探针报告：根节点超时未渲染 #${count + 1}`);
    GHealClaw.captureException(err, { subType: "white_screen" });
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">White Screen</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        手动上报一次 subType=white_screen 的异常，模拟根节点渲染超时探针触发。
        观察 Network 中 <code>/ingest/v1/events</code> 请求的 payload。
      </p>
      <button
        type="button"
        onClick={fireWhiteScreen}
        className="rounded border border-cyan-600 bg-cyan-600 px-4 py-2 text-sm text-white transition hover:bg-cyan-700"
      >
        上报白屏事件
      </button>
      <p className="text-xs text-neutral-500">已触发 {count} 次</p>
    </section>
  );
}
