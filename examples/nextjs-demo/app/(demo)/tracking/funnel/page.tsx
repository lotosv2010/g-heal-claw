"use client";

import { track } from "@g-heal-claw/sdk";
import { useState } from "react";

/**
 * 转化漏斗触发场景（ADR-0027）
 *
 * 3 个按钮按序上报 `view_home` → `click_cta` → `submit_form`，
 * 用于驱动 Web 大盘「埋点分析 → 转化漏斗」的默认 steps 视图。
 *
 * 验证路径：
 *  1. 按下方按钮 1/2/3 顺序点击（每次点击都会立即上报）
 *  2. 打开 DevTools → Network → `/ingest/v1/events` 看 type:track
 *  3. 在 Web 后台访问 `/tracking/funnel`（默认 steps=view_home,click_cta,submit_form）
 *  4. 漏斗 3 步用户数应分别显示 = 当前 user/session 的命中次数（去重到用户）
 *
 * 关联：apps/docs/docs/guide/dashboard/tracking-funnel.md（本场景 + 后台页面的使用指南）
 */
export default function TrackingFunnelPage() {
  const [hits, setHits] = useState({ view: 0, click: 0, submit: 0 });

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">转化漏斗触发器</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          按 1 → 2 → 3 顺序点击，然后访问 Web 后台{" "}
          <code>/tracking/funnel</code>（默认 steps =
          <code>view_home,click_cta,submit_form</code>）查看漏斗。
        </p>
      </header>

      <ol className="space-y-4">
        <Step
          order={1}
          eventName="view_home"
          hint="首屏访问 —— 漏斗起点（totalEntered）"
          tone="indigo"
          count={hits.view}
          onFire={() => {
            track("view_home", { source: "demo/tracking/funnel" });
            setHits((h) => ({ ...h, view: h.view + 1 }));
          }}
        />
        <Step
          order={2}
          eventName="click_cta"
          hint="主 CTA 点击 —— conversionFromPrev = 本步 / 第一步"
          tone="violet"
          count={hits.click}
          onFire={() => {
            track("click_cta", { label: "primary", from: "funnel-demo" });
            setHits((h) => ({ ...h, click: h.click + 1 }));
          }}
        />
        <Step
          order={3}
          eventName="submit_form"
          hint="表单提交 —— overallConversion = 末步 / 首步"
          tone="emerald"
          count={hits.submit}
          onFire={() => {
            track("submit_form", { form: "signup", success: true });
            setHits((h) => ({ ...h, submit: h.submit + 1 }));
          }}
        />
      </ol>

      <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 p-4 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-400">
        <p>
          <b>提示</b>：漏斗按用户级去重（COALESCE(user_id,session_id)），同一 session
          重复点击同一步不会放大步内用户数；但会放大该步的「事件次数」。漏斗 API 只看
          <code>users</code>，所以重复点击不影响转化率。
        </p>
        <p className="mt-2">
          步长上限 <code>stepWindowMinutes</code> 默认 60min；当前 session
          相邻两步间隔超出该窗口则视为"未按时"抵达下一步。
        </p>
      </div>
    </section>
  );
}

function Step({
  order,
  eventName,
  hint,
  tone,
  count,
  onFire,
}: {
  readonly order: number;
  readonly eventName: string;
  readonly hint: string;
  readonly tone: "indigo" | "violet" | "emerald";
  readonly count: number;
  readonly onFire: () => void;
}) {
  const toneClass = {
    indigo: "border-indigo-600 bg-indigo-600 hover:bg-indigo-700",
    violet: "border-violet-600 bg-violet-600 hover:bg-violet-700",
    emerald: "border-emerald-600 bg-emerald-600 hover:bg-emerald-700",
  }[tone];

  return (
    <li className="flex flex-col gap-2 rounded border border-neutral-200 p-4 dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          第 {order} 步
        </div>
        <div className="mt-1 font-medium">
          <code>{eventName}</code>
        </div>
        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
          {hint}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="tabular-nums text-xs text-neutral-500">
          已触发 {count} 次
        </span>
        <button
          type="button"
          onClick={onFire}
          className={`rounded border px-4 py-2 text-sm font-medium text-white transition ${toneClass}`}
        >
          触发 {eventName}
        </button>
      </div>
    </li>
  );
}
