"use client";

import { useEffect, type ReactNode } from "react";
import { init } from "@g-heal-claw/sdk";

/**
 * 浏览器端 SDK 初始化器
 *
 * - 读取 NEXT_PUBLIC_GHC_DSN / ENV / RELEASE
 * - 只在客户端执行一次，避免 SSR 访问 window
 */
export function GhcProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_GHC_DSN;
    if (!dsn) {
      // 未配置 DSN 时静默跳过；SDK 同样会进入 no-op
      console.warn("[ghc-demo] NEXT_PUBLIC_GHC_DSN 未配置，SDK 未初始化");
      return;
    }
    init({
      dsn,
      environment: process.env.NEXT_PUBLIC_GHC_ENV ?? "development",
      release: process.env.NEXT_PUBLIC_GHC_RELEASE,
      debug: true,
    });
  }, []);

  return <>{children}</>;
}
