"use client";

import { track } from "@g-heal-claw/sdk";
import { useEffect, useRef, useState } from "react";

/**
 * 埋点 Playground —— 一页演示 trackPlugin 的 4 类事件
 *
 * - click  ：带 [data-track] / [data-track-id] 的按钮点击
 * - expose ：带 [data-track-expose] 的元素滚动到视口 ≥500ms 触发
 * - submit ：form 提交（capture 阶段）
 * - code   ：GHealClaw.track(name, props) 主动埋点
 *
 * 打开 DevTools → Network 观察 `/ingest/v1/events`；也可在 Web 大盘「事件分析」查看。
 */
export default function TrackingPlaygroundPage() {
  const [codeCount, setCodeCount] = useState(0);
  const [submitCount, setSubmitCount] = useState(0);
  const [email, setEmail] = useState("demo@example.com");
  const exposeAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    exposeAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fireCodeTrack = () => {
    setCodeCount((n) => n + 1);
    track("playground_code_click", {
      from: "playground",
      count: codeCount + 1,
    });
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitCount((n) => n + 1);
  };

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">埋点 Playground</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          4 类埋点事件一页触达；打开 Network 观察 <code>/ingest/v1/events</code>{" "}
          的 <code>type:track</code> 事件，并访问 Web 后台「埋点分析 → 事件分析」。
        </p>
      </header>

      {/* 1. click */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          1. Click 全埋点（data-track / data-track-id）
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-track
            data-track-id="playground_cta_primary"
            data-track-cta="primary"
            className="rounded border border-violet-600 bg-violet-600 px-4 py-2 text-sm text-white transition hover:bg-violet-700"
          >
            主 CTA（有 data-track-id）
          </button>
          <button
            type="button"
            data-track="playground_cta_secondary"
            className="rounded border border-violet-400 bg-white px-4 py-2 text-sm text-violet-700 transition hover:bg-violet-50 dark:bg-neutral-900 dark:text-violet-300"
          >
            次 CTA（data-track 简写）
          </button>
          <button
            type="button"
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-500 dark:bg-neutral-900"
          >
            无 data-track（不采集）
          </button>
        </div>
      </div>

      {/* 2. submit */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          2. Submit 全埋点
        </h2>
        <form
          data-track-id="playground_signup_form"
          data-track-channel="demo"
          onSubmit={handleFormSubmit}
          className="flex max-w-md flex-wrap gap-2"
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            placeholder="you@example.com"
          />
          <button
            type="submit"
            className="rounded border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm text-white transition hover:bg-emerald-700"
          >
            Submit
          </button>
        </form>
        <p className="text-xs text-neutral-500">已提交 {submitCount} 次</p>
      </div>

      {/* 3. code */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          3. Code 代码埋点（GHealClaw.track）
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={fireCodeTrack}
            className="rounded border border-amber-600 bg-amber-600 px-4 py-2 text-sm text-white transition hover:bg-amber-700"
          >
            手动上报 playground_code_click
          </button>
        </div>
        <p className="text-xs text-neutral-500">已上报 {codeCount} 次</p>
      </div>

      {/* 4. expose */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          4. Expose 曝光（data-track-expose，停留 500ms）
        </h2>
        <p className="text-xs text-neutral-500">
          为便于演示，滚动下方占位区块使紫色卡片进入视口并停留片刻。
        </p>
        <div className="h-80 rounded border border-dashed border-neutral-300 bg-neutral-50 p-4 text-xs text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900">
          （占位区块，滚动下去）
        </div>
        <div
          ref={exposeAnchorRef}
          data-track-expose
          data-track-id="playground_promo_card"
          data-track-module="promo"
          className="rounded-xl border border-violet-400 bg-violet-50 p-6 text-sm text-violet-900 shadow-sm dark:bg-violet-950 dark:text-violet-100"
        >
          <div className="font-semibold">Promo 曝光卡</div>
          <div className="mt-1 text-xs text-violet-700 dark:text-violet-300">
            停留 ≥500ms 后上报一次 expose 事件（本 demo 由 provider 配置 300ms）
          </div>
        </div>
        <div className="h-96" />
      </div>
    </section>
  );
}
