import { Suspense } from "react";
import { cookies } from "next/headers";
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
 *
 * 认证令牌注入：
 *  - 从 cookie 读取 accessToken，注入 globalThis 供服务端组件的 fetch 调用使用
 */
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 从 cookie 读取 accessToken / projectId / environment 并注入全局
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("ghc-at")?.value;
  if (accessToken) {
    globalThis._serverAccessToken = accessToken;
  }
  const projectId = cookieStore.get("ghc-project")?.value;
  if (projectId) {
    globalThis._serverProjectId = projectId;
  }
  const environment = cookieStore.get("ghc-env")?.value;
  if (environment) {
    globalThis._serverEnvironment = environment;
  }

  return (
    <div className="bg-background min-h-screen">
      <Suspense fallback={<div className="fixed inset-y-0 left-0 z-30 hidden w-60 md:block" />}>
        <Sidebar />
      </Suspense>
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
