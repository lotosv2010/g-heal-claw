import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";

/**
 * Dashboard 路由组外壳
 *
 * 布局要求（layout 优化）：
 *  - 左侧 Sidebar 固定定位、高度等于视口高度
 *  - 右侧内容区（含 Topbar + main）在内部滚动，Topbar 吸顶
 *  - 通过左 padding 为 Sidebar 让出 56 宽（md 以上），小屏 Sidebar 隐藏
 */
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="bg-background min-h-screen">
      <Sidebar />
      <div className="flex h-screen flex-col md:pl-56">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
