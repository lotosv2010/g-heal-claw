"use client";

import { useState } from "react";

/**
 * Click 全埋点场景
 *
 * 触发规则：插件在 document 的 capture 阶段监听 click，向上查找带
 * [data-track] 或 [data-track-id] 的祖先，命中即上报（type='track', trackType='click'）。
 * 未打标的节点被忽略，避免噪声。
 *
 * 读取规则：
 *  - selector：优先 data-track-id > data-track > #id > tag.class > tag
 *  - properties：data-track-* 前缀的 dataset 自动采集（排除 data-track / data-track-id）
 *  - 节流：同 selector 1s 内最多一次
 */
export default function TrackingClickPage() {
  const [log, setLog] = useState<readonly string[]>([]);
  const append = (line: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString()} · ${line}`, ...prev].slice(0, 6));

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Click 全埋点</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          打开 DevTools → Network，点击下面任意 <b>带 data-track 标注</b> 的元素，观察
          <code className="mx-1 rounded bg-neutral-200 px-1 py-0.5 text-xs dark:bg-neutral-800">
            /ingest/v1/events
          </code>
          载荷中的 <code>trackType:&quot;click&quot;</code>。
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className="rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800"
          data-track
          data-track-id="cta_primary"
          data-track-placement="card"
          data-track-cta="primary"
          onClick={() => append("点击 #cta_primary（data-track-id 命中 + 多个 data-track-* 属性）")}
        >
          <div className="font-medium">主 CTA（祖先监听）</div>
          <div className="text-xs text-neutral-500">
            本身是 div 且带 data-track-id=&quot;cta_primary&quot;；内部任意子节点点击都会命中
          </div>
          <button
            type="button"
            className="mt-2 rounded border border-violet-600 bg-violet-600 px-3 py-1 text-xs text-white"
          >
            子按钮（命中祖先）
          </button>
        </div>

        <div
          data-track="nav_home_shortcut"
          data-track-section="header"
          onClick={() => append("点击 #nav_home_shortcut（data-track 简写）")}
          className="cursor-pointer rounded border border-violet-400 bg-white p-4 text-sm text-violet-700 dark:bg-neutral-900 dark:text-violet-300"
        >
          <div className="font-medium">data-track 简写</div>
          <div className="text-xs text-neutral-500">
            仅 data-track=&quot;nav_home_shortcut&quot;，selector 直接取该值
          </div>
        </div>

        <button
          type="button"
          onClick={() => append("点击：未标注按钮（插件不采集）")}
          className="rounded border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-500 dark:bg-neutral-900"
        >
          未标注按钮（对照组 · 不上报）
        </button>

        <button
          type="button"
          data-track-id="throttle_probe"
          onClick={() => append("点击 #throttle_probe（连续点 3 次，1s 内仅上报 1 次）")}
          className="rounded border border-amber-500 bg-amber-500 px-4 py-3 text-sm text-white"
        >
          节流测试（连点观察）
        </button>
      </div>

      <LogPanel items={log} />
    </section>
  );
}

function LogPanel({ items }: { readonly items: readonly string[] }) {
  return (
    <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
      <div className="mb-1 font-medium text-neutral-500">本地操作日志（最近 6 条）</div>
      {items.length === 0 ? (
        <div className="text-neutral-400">尚未触发点击</div>
      ) : (
        <ul className="space-y-0.5 font-mono">
          {items.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
