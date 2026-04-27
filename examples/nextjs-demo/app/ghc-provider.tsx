"use client";

import { useEffect, type ReactNode } from "react";
import { init, performancePlugin } from "@g-heal-claw/sdk";

/**
 * 浏览器端 SDK 初始化器
 *
 * - 读取 NEXT_PUBLIC_GHC_DSN / ENV / RELEASE
 * - 只在客户端执行一次，避免 SSR 访问 window
 * - 注册 PerformancePlugin：自动采集 LCP/FCP/CLS/INP/TTFB + Navigation 瀑布
 *   （LCP/INP/CLS 在 visibilitychange=hidden / pagehide 时才上报最终值，
 *   若只看 Network 不切换标签页可能观察不到；TTFB/FCP/Navigation 通常
 *   在页面加载完成后立即可见）
 */
export function GhcProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_GHC_DSN;
    if (!dsn) {
      // 未配置 DSN 时静默跳过；SDK 同样会进入 no-op
      console.warn("[ghc-demo] NEXT_PUBLIC_GHC_DSN 未配置，SDK 未初始化");
      return;
    }
    init(
      {
        dsn,
        environment: process.env.NEXT_PUBLIC_GHC_ENV ?? "development",
        release: process.env.NEXT_PUBLIC_GHC_RELEASE,
        debug: true,
      },
      { plugins: [performancePlugin()] },
    );
  }, []);

  return <>{children}</>;
}
