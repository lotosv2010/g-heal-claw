/**
 * 轻量主题管理（浅色 / 深色 / 跟随系统）
 *
 * 不引入 next-themes，直接基于 localStorage + matchMedia：
 *  - 持久化 key: ghc-theme，取值 "light" | "dark" | "system"
 *  - 默认 "system"（跟随 prefers-color-scheme）
 *  - <html> 上挂 class="dark"（与 globals.css 的 @custom-variant dark 匹配）
 *  - 对外暴露 applyTheme() / getStoredTheme() —— Topbar 按钮与 layout 阻塞脚本复用
 */

export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "ghc-theme";

/** 把 mode 解析为实际要应用的外观（system → 读取媒体查询） */
export function resolveAppearance(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

/** 把外观写到 <html> 的 class 上；同时把 mode 存入 localStorage */
export function applyTheme(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  const appearance = resolveAppearance(mode);
  document.documentElement.classList.toggle("dark", appearance === "dark");
  document.documentElement.dataset.theme = mode;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // localStorage 可能被禁用（隐私模式等），静默忽略
  }
}

/** 读取持久化的 mode；非法值降级为 "system" */
export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // ignore
  }
  return "system";
}

/**
 * SSR 前置脚本：在 React 水合前尽快写入 class="dark"，避免首屏闪白
 * —— 返回一段 IIFE 字符串，交给 layout.tsx 的 <script> 内联注入
 */
export const THEME_INIT_SCRIPT = `(() => {
  try {
    var m = localStorage.getItem('${THEME_STORAGE_KEY}') || 'system';
    var dark = m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.dataset.theme = m;
  } catch (e) {}
})();`;
