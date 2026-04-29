"use client";

import { useState } from "react";

/**
 * Submit 全埋点场景
 *
 * 触发规则：插件在 document 的 capture 阶段监听 submit，命中目标为 HTMLFormElement。
 * 无论 form 是否打标都会上报；data-track-id 可提供更稳定的 selector 别名。
 *
 * 读取规则：
 *  - selector：data-track-id > data-track > #formId > form.class > form
 *  - properties：data-track-* 自动采集（注意：form 里 input 的 name/value 不会自动采集，需手动加 data-track-*）
 *  - 节流：同 selector 1s 内最多一次
 */
export default function TrackingSubmitPage() {
  const [submitted, setSubmitted] = useState(0);

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Submit 全埋点</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          提交下方任意表单即上报（<code>trackType:&quot;submit&quot;</code>）；
          注意 <b>input 的值不会被自动采集</b>，业务需通过 <code>data-track-*</code> 主动暴露。
        </p>
      </header>

      <form
        data-track-id="signup_form"
        data-track-channel="demo"
        data-track-step="email_only"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted((n) => n + 1);
        }}
        className="flex max-w-md flex-wrap gap-2 rounded border border-neutral-200 p-4 dark:border-neutral-800"
      >
        <div className="w-full text-sm font-medium">注册表单（带 data-track-*）</div>
        <input
          type="email"
          defaultValue="demo@example.com"
          name="email"
          className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          className="rounded border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm text-white"
        >
          提交（signup_form）
        </button>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted((n) => n + 1);
        }}
        className="flex max-w-md flex-wrap gap-2 rounded border border-dashed border-neutral-300 p-4 dark:border-neutral-700"
      >
        <div className="w-full text-sm font-medium">无标注表单（selector 回退为 form 标签）</div>
        <input
          type="text"
          defaultValue="feedback"
          className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          className="rounded border border-neutral-500 bg-white px-4 py-2 text-sm dark:bg-neutral-900"
        >
          提交（未打标）
        </button>
      </form>

      <p className="text-xs text-neutral-500">已提交 {submitted} 次</p>
    </section>
  );
}
