"use client";

import { useState } from "react";

/**
 * 慢脚本演示 → 驱动 `resourcePlugin` 采集 type='resource' 的 script 样本
 *
 * 目的：通过在页面动态 `<script>` 注入一个带人为延迟的 JS URL，让 PerformanceResourceTiming
 * 的 duration 足够大（≥ 500ms），从而落在 demo `resourcePlugin({ slowThresholdMs: 500 })`
 * 配置下的慢阈值之上，并最终出现在 `/monitor/resources` 大盘的「Top 慢资源」里。
 *
 * 实现：httpbin.org/delay/{sec} 会在服务端休眠对应秒数后响应，相当于拿它当"慢 JS 源"；
 * 内容不是真 JS 也没关系（会被当成解析失败的脚本，但 RT 依然会被采集）。
 */
const DELAY_OPTIONS = [0, 1, 2, 3] as const;

export default function SlowScriptPage() {
  const [delay, setDelay] = useState<number>(2);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  function triggerSlowScript() {
    const cacheBust = Date.now();
    const src = `https://httpbin.org/delay/${delay}?r=${cacheBust}`;
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => setLoadedKey(src);
    script.onerror = () => setLoadedKey(`${src} (load failed but timing captured)`);
    document.head.appendChild(script);
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">慢脚本 → Top 慢资源</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        动态注入一个带延迟的{" "}
        <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">
          &lt;script&gt;
        </code>
        ，让浏览器把它计入{" "}
        <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">
          PerformanceResourceTiming
        </code>
        。`resourcePlugin` 将 duration ≥{" "}
        <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">
          slowThresholdMs
        </code>{" "}
        的样本标记为 `slow=true`，可在 apps/web `/monitor/resources` 大盘「Top 慢资源」定位到该 URL。
      </p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-500">延迟秒数：</span>
        {DELAY_OPTIONS.map((sec) => (
          <button
            key={sec}
            type="button"
            onClick={() => setDelay(sec)}
            className={`rounded border px-3 py-1 transition ${
              sec === delay
                ? "border-teal-600 bg-teal-600 text-white"
                : "border-neutral-300 hover:border-neutral-500"
            }`}
          >
            {sec}s
          </button>
        ))}
        <button
          type="button"
          onClick={triggerSlowScript}
          className="ml-4 rounded bg-neutral-900 px-3 py-1 text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          触发慢脚本
        </button>
      </div>

      {loadedKey ? (
        <p className="rounded bg-teal-50 px-3 py-2 text-xs text-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
          已触发：{loadedKey}
        </p>
      ) : null}
    </section>
  );
}
