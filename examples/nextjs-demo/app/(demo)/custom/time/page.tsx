"use client";

import { time } from "@g-heal-claw/sdk";
import { useState } from "react";

/**
 * Custom Time（自定义业务测速）场景
 *
 * 触发规则：业务代码主动调用 <code>time(name, durationMs, properties?)</code>
 *  （UMD 用户通过 <code>window.GHealClaw.time(...)</code>）；
 * customPlugin 产出 <code>type='custom_metric'</code>，驱动大盘 p50/p75/p95 + avg 聚合。
 *
 * 用途：不依赖 Web Vitals 的业务关键路径计时（登录耗时、结算耗时、编辑器冷启动等）。
 * 校验：duration 必须为有限非负数且 ≤ 24h，否则静默丢弃。
 */
export default function CustomTimePage() {
  const [samples, setSamples] = useState<
    { name: string; duration: number }[]
  >([]);

  const measure = async (
    name: string,
    work: () => Promise<void> | void,
    properties?: Record<string, unknown>,
  ) => {
    const t0 = performance.now();
    await work();
    const dur = Math.round(performance.now() - t0);
    time(name, dur, properties);
    setSamples((prev) => [{ name, duration: dur }, ...prev].slice(0, 10));
  };

  const manual = (name: string, duration: number) => {
    time(name, duration, { manual: true });
    setSamples((prev) => [{ name, duration }, ...prev].slice(0, 10));
  };

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Custom Time · 业务测速</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          主动调用 <code>GHealClaw.time(name, durationMs, props?)</code> 上报业务耗时；
          打开 Network 观察 <code>type:custom_metric</code>，在大盘查看
          p50/p75/p95 分位数。
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() =>
            measure(
              "checkout_duration",
              () => new Promise((r) => setTimeout(r, 200 + Math.random() * 400)),
              { step: "pay" },
            )
          }
          className="rounded border border-emerald-600 bg-emerald-600 px-4 py-3 text-sm text-white"
        >
          checkout_duration（模拟 200~600ms）
        </button>
        <button
          type="button"
          onClick={() =>
            measure(
              "editor_cold_start",
              () => new Promise((r) => setTimeout(r, 500 + Math.random() * 1500)),
              { editor: "rich" },
            )
          }
          className="rounded border border-sky-600 bg-sky-600 px-4 py-3 text-sm text-white"
        >
          editor_cold_start（500~2000ms）
        </button>
        <button
          type="button"
          onClick={() => manual("manual_custom_timer", 123)}
          className="rounded border border-violet-600 bg-violet-600 px-4 py-3 text-sm text-white"
        >
          手填 duration=123ms
        </button>
        <button
          type="button"
          onClick={() => manual("outlier_timer", 60_000)}
          className="rounded border border-amber-600 bg-amber-600 px-4 py-3 text-sm text-white"
        >
          离群值 duration=60000ms
        </button>
      </div>

      <div className="space-y-1 text-xs text-neutral-500">
        <div>最近 10 次样本：</div>
        <ul className="space-y-0.5 font-mono">
          {samples.length === 0 ? (
            <li className="text-neutral-400">（无）</li>
          ) : (
            samples.map((s, i) => (
              <li key={i}>
                {s.name} · {s.duration}ms
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
