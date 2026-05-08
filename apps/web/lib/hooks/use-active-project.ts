"use client";

/**
 * 客户端获取当前活跃项目 ID（从 cookie 或环境变量）
 */
export function useActiveProject(): string {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/projectId=([^;]+)/);
    if (match) return match[1]!;
  }
  return process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "demo";
}
