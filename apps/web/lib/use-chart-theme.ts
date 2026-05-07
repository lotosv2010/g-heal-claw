"use client";

import { useEffect, useState } from "react";

/**
 * 检测当前深色模式状态，返回 AntV 图表 theme 值。
 * 监听 class 变化自动切换。
 */
export function useChartTheme(): "classicDark" | "classic" {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();

    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark ? "classicDark" : "classic";
}
