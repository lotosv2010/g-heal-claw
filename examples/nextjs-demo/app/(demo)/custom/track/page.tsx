"use client";

import { trackCustom } from "@g-heal-claw/sdk";
import { useState } from "react";

/**
 * Custom Track（自定义业务埋点）场景
 *
 * 触发规则：业务代码主动调用 <code>trackCustom(name, properties)</code>
 *  （UMD 用户通过 <code>window.GHealClaw.track(...)</code>）；
 * customPlugin 产出 <code>type='custom_event'</code>，驱动「埋点分析 → 自定义上报」大盘。
 *
 * 与 trackPlugin（被动 DOM 埋点 type='track'）完全独立：
 *  - trackPlugin.track → type='track', trackType='code'（兼容旧埋点）
 *  - customPlugin.trackCustom → type='custom_event'（业务主动埋点 / 事件大盘）
 *
 * Bundler 用户推荐走 ESM 具名导入（tree-shake 友好、类型完整、无副作用）。
 */
export default function CustomTrackPage() {
  const [total, setTotal] = useState(0);

  const fire = (name: string, props: Record<string, unknown>) => {
    trackCustom(name, props);
    setTotal((n) => n + 1);
  };

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Custom Track · 业务埋点</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          主动调用 <code>GHealClaw.track(name, props)</code> 上报业务事件；
          打开 Network 观察 <code>/ingest/v1/events</code> 中
          <code>type:custom_event</code>，并在后台「埋点分析 → 自定义上报」查看。
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() =>
            fire("cart_add", {
              sku: "SKU-A",
              price: 99.9,
              qty: 1,
              orderId: `o-${Date.now()}`,
            })
          }
          className="rounded border border-violet-600 bg-violet-600 px-4 py-3 text-sm text-white"
        >
          cart_add（购物车加购）
        </button>
        <button
          type="button"
          onClick={() =>
            fire("checkout_success", {
              amount: 299,
              currency: "CNY",
              payMethod: "alipay",
            })
          }
          className="rounded border border-emerald-600 bg-emerald-600 px-4 py-3 text-sm text-white"
        >
          checkout_success（下单成功）
        </button>
        <button
          type="button"
          onClick={() =>
            fire("banner_click", { bannerId: "promo_618", position: "home_top" })
          }
          className="rounded border border-sky-600 bg-sky-600 px-4 py-3 text-sm text-white"
        >
          banner_click
        </button>
        <button
          type="button"
          onClick={() => fire("share_click", { channel: "wechat" })}
          className="rounded border border-amber-600 bg-amber-600 px-4 py-3 text-sm text-white"
        >
          share_click
        </button>
      </div>

      <p className="text-xs text-neutral-500">已上报 {total} 次 custom_event</p>
    </section>
  );
}
