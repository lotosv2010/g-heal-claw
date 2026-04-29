"use client";

import { useState } from "react";

/**
 * Expose 曝光场景
 *
 * 触发规则：插件对 `[data-track-expose]` 节点启用 IntersectionObserver（threshold 0.5）；
 * 进入视口后等待 `exposeDwellMs` 停留时间再上报一次（<b>同一节点不重复上报</b>）。
 *
 * 本 demo 的 provider 将 `exposeDwellMs` 降至 300ms 便于观察；动态插入的节点通过
 * MutationObserver 自动接管，无需手动注册。
 */
export default function TrackingExposePage() {
  const [extraCount, setExtraCount] = useState(0);

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Expose 曝光</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          滚动页面，紫色卡片进入视口 ≥300ms（demo 配置）即上报
          <code className="mx-1 rounded bg-neutral-200 px-1 py-0.5 text-xs dark:bg-neutral-800">
            trackType:&quot;expose&quot;
          </code>
          ；同一节点仅上报一次。
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setExtraCount((n) => n + 1)}
          className="rounded border border-violet-600 bg-violet-600 px-3 py-1 text-xs text-white"
        >
          动态追加一张曝光卡（验证 MutationObserver）
        </button>
        <button
          type="button"
          onClick={() => setExtraCount(0)}
          className="rounded border border-neutral-300 bg-white px-3 py-1 text-xs dark:bg-neutral-900"
        >
          清空动态卡
        </button>
      </div>

      <div className="h-72 rounded border border-dashed border-neutral-300 bg-neutral-50 p-4 text-xs text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900">
        （占位区块 · 向下滚动触发曝光）
      </div>

      <ExposeCard trackId="promo_hero" module_="home">
        首屏 Hero 曝光（首次进入页面自动命中）
      </ExposeCard>

      <div className="h-64" />

      <ExposeCard trackId="promo_pricing" module_="pricing">
        定价卡曝光（滚动到可见后停留 300ms）
      </ExposeCard>

      {Array.from({ length: extraCount }).map((_, i) => (
        <ExposeCard key={i} trackId={`dynamic_card_${i + 1}`} module_="dynamic">
          动态追加卡 #{i + 1}（验证 MutationObserver 增量监听）
        </ExposeCard>
      ))}

      <div className="h-96" />
    </section>
  );
}

function ExposeCard({
  trackId,
  module_,
  children,
}: {
  readonly trackId: string;
  readonly module_: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      data-track-expose
      data-track-id={trackId}
      data-track-module={module_}
      className="my-4 rounded-xl border border-violet-400 bg-violet-50 p-6 text-sm text-violet-900 shadow-sm dark:bg-violet-950 dark:text-violet-100"
    >
      <div className="font-semibold">{children}</div>
      <div className="mt-1 text-xs text-violet-700 dark:text-violet-300">
        data-track-id=&quot;{trackId}&quot; · data-track-module=&quot;{module_}&quot;
      </div>
    </div>
  );
}
