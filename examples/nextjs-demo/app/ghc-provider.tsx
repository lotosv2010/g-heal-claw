"use client";

import { useEffect, type ReactNode } from "react";
import {
  apiPlugin,
  errorPlugin,
  fspPlugin,
  httpPlugin,
  init,
  longTaskPlugin,
  performancePlugin,
  speedIndexPlugin,
  trackPlugin,
} from "@g-heal-claw/sdk";

/**
 * 浏览器端 SDK 初始化器
 *
 * - 读取 NEXT_PUBLIC_GHC_DSN / ENV / RELEASE
 * - 只在客户端执行一次，避免 SSR 访问 window
 * - PerformancePlugin：自动采集 LCP/FCP/CLS/INP/TTFB + Navigation 瀑布
 *   （LCP/INP/CLS 在 visibilitychange=hidden / pagehide 时才上报最终值，
 *   若只看 Network 不切换标签页可能观察不到；TTFB/FCP/Navigation 通常
 *   在页面加载完成后立即可见）
 * - LongTaskPlugin：采集 ≥50ms 主线程阻塞任务（PerformanceObserver longtask）
 * - SpeedIndexPlugin：近似采集 Speed Index（FP/FCP/LCP 三里程碑 AUC）
 * - FspPlugin：MutationObserver + rAF 采集首屏稳定时间（ADR-0018 P0.3）
 * - ErrorPlugin：捕获 window.error（JS + 资源）+ unhandledrejection
 * - HttpPlugin：捕获 fetch / XHR 的 ajax 失败 + 业务 code 异常（type='error'）
 * - ApiPlugin：采集 fetch / XHR 全量请求明细（含成功，type='api'），驱动 API 大盘
 * - TrackPlugin：采集 4 类埋点事件（click / submit / expose / code，type='track'），驱动事件分析大盘
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
      {
        plugins: [
          performancePlugin(),
          longTaskPlugin(),
          speedIndexPlugin(),
          fspPlugin(),
          errorPlugin(),
          httpPlugin({
            // 默认兜底：响应 JSON 中 code ≠ 0 视为 api_code 异常
            // 可在业务接入时按需替换 apiCodeFilter
          }),
          apiPlugin({
            // 默认 slowThresholdMs=1000；demo 降至 300 便于在本地演示慢请求
            slowThresholdMs: 300,
          }),
          trackPlugin({
            // demo 曝光停留 300ms，便于快速演示
            exposeDwellMs: 300,
          }),
        ],
      },
    );
  }, []);

  return <>{children}</>;
}
