"use client";

import { track } from "@g-heal-claw/sdk";
import { useState } from "react";

/**
 * Code 代码埋点场景
 *
 * 触发规则：业务代码显式调用 `track(name, properties)`（或 `GHealClaw.track`）；
 * 插件不会自动触发。上报为 <code>type='track', trackType='code'</code>。
 *
 * 字段约定：
 *  - name：事件名，建议 <domain>_<action> 命名；空串会被静默丢弃
 *  - properties：扁平键值对（会自动附加 <code>__name</code> 字段用于大盘聚合）
 */
export default function TrackingCodePage() {
  const [total, setTotal] = useState(0);
  const [amount, setAmount] = useState(99.9);

  const fire = (name: string, props: Record<string, unknown>) => {
    track(name, props);
    setTotal((n) => n + 1);
  };

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Code 代码埋点</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          显式调用 <code>track(name, props)</code> 主动上报业务事件；
          也可通过 UMD 命名空间 <code>GHealClaw.track(...)</code> 调用。
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => fire("checkout_submit", { amount, currency: "CNY", orderId: `o-${Date.now()}` })}
          className="rounded border border-amber-600 bg-amber-600 px-4 py-3 text-sm text-white"
        >
          checkout_submit（amount={amount}）
        </button>
        <button
          type="button"
          onClick={() => fire("login_success", { channel: "password" })}
          className="rounded border border-emerald-600 bg-emerald-600 px-4 py-3 text-sm text-white"
        >
          login_success
        </button>
        <button
          type="button"
          onClick={() => fire("video_play_start", { videoId: "v-001", position: 0 })}
          className="rounded border border-sky-600 bg-sky-600 px-4 py-3 text-sm text-white"
        >
          video_play_start
        </button>
        <button
          type="button"
          onClick={() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sdk = (globalThis as any).GHealClaw;
            sdk?.track?.("umd_namespace_probe", { from: "umd" });
            setTotal((n) => n + 1);
          }}
          className="rounded border border-violet-600 bg-violet-600 px-4 py-3 text-sm text-white"
        >
          GHealClaw.track（UMD 命名空间）
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="amt">amount:</label>
        <input
          id="amt"
          type="number"
          step="0.1"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-32 rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <p className="text-xs text-neutral-500">已触发 {total} 次</p>
    </section>
  );
}
