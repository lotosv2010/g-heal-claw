import { Suspense } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";

/**
 * Dashboard 路由组外壳
 *
 * 布局要求（layout 优化）：
 *  - 左侧 Sidebar 固定定位、高度等于视口高度
 *  - 右侧内容区（含 Topbar + main）在内部滚动，Topbar 吸顶
 *  - 通过左 padding 为 Sidebar 让出 56 宽（md 以上），小屏 Sidebar 隐藏
 *
 * Topbar 使用 `useSearchParams()` 订阅 URL 时间参数；Next 16 要求其必须位于
 * Suspense 边界内，否则静态预渲染会命中 CSR bailout 导致构建失败。
 * 外层占位保持 Topbar 尺寸（h-14 + border-b），避免 hydration 闪烁。
 */
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="bg-background min-h-screen">
      <Sidebar />
      <div className="flex h-screen flex-col md:pl-60">
        <Suspense
          fallback={
            <div
              className="bg-background/80 sticky top-0 z-20 h-14 shrink-0 border-b border-black/[0.04] backdrop-blur-xl dark:border-white/[0.06]"
              aria-hidden
            />
          }
        >
          <Topbar />
        </Suspense>
        <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
