"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { AiDrawer } from "./ai-drawer";

// ── Context 定义 ──

interface AiDrawerContextValue {
  readonly open: boolean;
  readonly setOpen: (value: boolean) => void;
  readonly toggle: () => void;
}

const AiDrawerContext = createContext<AiDrawerContextValue | null>(null);

// ── Provider ──

interface AiDrawerProviderProps {
  readonly children: ReactNode;
  readonly projectId: string;
}

/**
 * AI 抽屉全局 Provider
 *
 * 包裹在 Dashboard 布局中，提供 open/setOpen 状态给 Topbar 按钮控制。
 * 同时渲染 AiDrawer 组件本身。
 */
export function AiDrawerProvider({ children, projectId }: AiDrawerProviderProps) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  return (
    <AiDrawerContext.Provider value={{ open, setOpen, toggle }}>
      {children}
      <AiDrawer projectId={projectId} open={open} onOpenChange={setOpen} />
    </AiDrawerContext.Provider>
  );
}

// ── Hook ──

/**
 * 获取 AI 抽屉控制器
 *
 * 必须在 AiDrawerProvider 内部使用。
 */
export function useAiDrawer(): AiDrawerContextValue {
  const ctx = useContext(AiDrawerContext);
  if (!ctx) {
    throw new Error("useAiDrawer 必须在 AiDrawerProvider 内部使用");
  }
  return ctx;
}
