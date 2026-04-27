"use client";

import { GHealClaw } from "@g-heal-claw/sdk";

/**
 * 三个按钮分别触发：
 * 1. captureMessage — 落 custom_log
 * 2. throwError     — 手动抛异常并交给 captureException
 * 3. manualBreadcrumb — 追加面包屑（不立即上报，随下一个事件发出）
 */
export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">g-heal-claw SDK Demo</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          打开 DevTools → Network，点击下方按钮观察对
          <code className="mx-1 rounded bg-neutral-200 px-1 py-0.5 text-xs dark:bg-neutral-800">
            /ingest/v1/events
          </code>
          的 POST 请求。
        </p>
      </header>

      <section className="grid gap-3">
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
          onClick={() => GHealClaw.captureMessage("hello from demo", "info")}
        >
          captureMessage("hello from demo")
        </button>

        <button
          type="button"
          className="rounded-lg bg-rose-600 px-4 py-2 text-white transition hover:bg-rose-700"
          onClick={() => {
            try {
              throw new Error("intentional demo error");
            } catch (err) {
              GHealClaw.captureException(err, { from: "demo-button" });
            }
          }}
        >
          captureException(new Error)
        </button>

        <button
          type="button"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-white transition hover:bg-emerald-700"
          onClick={() =>
            GHealClaw.addBreadcrumb({
              timestamp: Date.now(),
              category: "custom",
              level: "info",
              message: "manual breadcrumb",
            })
          }
        >
          addBreadcrumb(manual)
        </button>
      </section>

      <footer className="text-xs text-neutral-500">
        配置：NEXT_PUBLIC_GHC_DSN / NEXT_PUBLIC_GHC_ENV / NEXT_PUBLIC_GHC_RELEASE
      </footer>
    </main>
  );
}
