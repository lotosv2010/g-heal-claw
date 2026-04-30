"use client";

import { log } from "@g-heal-claw/sdk";
import { useState } from "react";

/**
 * Custom Log（分级日志）场景
 *
 * 触发规则：业务代码主动调用 <code>log(level, message, data?)</code>
 *  （UMD 用户通过 <code>window.GHealClaw.log(...)</code>）；
 * customPlugin 产出 <code>type='custom_log'</code>，驱动后台「监控 → 自定义日志」大盘。
 *
 * 防日志风暴：
 *  - data 序列化超过 8KB → 自动截断，追加 <code>__truncated: true</code>
 *  - 单会话 custom_log 上限 200 条，后续静默丢弃
 */
export default function CustomLogPage() {
  const [count, setCount] = useState(0);

  const fire = (
    level: "info" | "warn" | "error",
    message: string,
    data?: unknown,
  ) => {
    log(level, message, data);
    setCount((n) => n + 1);
  };

  const fireBigPayload = () => {
    // 约 10KB 触发截断分支
    const big = Array.from({ length: 200 }, (_, i) => ({
      idx: i,
      payload: "x".repeat(60),
    }));
    fire("warn", "big payload probe", { items: big });
  };

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Custom Log · 分级日志</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          主动调用 <code>GHealClaw.log(level, message, data?)</code> 上报业务日志；
          打开 Network 观察 <code>type:custom_log</code>，在「监控 → 自定义日志」大盘查看
          info / warn / error 三级别聚合。
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => fire("info", "user clicked share", { channel: "wechat" })}
          className="rounded border border-sky-600 bg-sky-600 px-4 py-3 text-sm text-white"
        >
          info · user clicked share
        </button>
        <button
          type="button"
          onClick={() =>
            fire("warn", "payment retry", { orderId: `o-${Date.now()}`, attempt: 2 })
          }
          className="rounded border border-amber-600 bg-amber-600 px-4 py-3 text-sm text-white"
        >
          warn · payment retry
        </button>
        <button
          type="button"
          onClick={() =>
            fire("error", "upload failed", { code: "E_TIMEOUT", file: "a.png" })
          }
          className="rounded border border-rose-600 bg-rose-600 px-4 py-3 text-sm text-white"
        >
          error · upload failed
        </button>
        <button
          type="button"
          onClick={fireBigPayload}
          className="rounded border border-violet-600 bg-violet-600 px-4 py-3 text-sm text-white"
        >
          warn · 大 payload（触发截断）
        </button>
      </div>

      <p className="text-xs text-neutral-500">本页已上报 {count} 条 custom_log</p>
    </section>
  );
}
