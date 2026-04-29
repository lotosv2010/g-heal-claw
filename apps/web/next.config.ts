import type { NextConfig } from "next";

// 通过 transpilePackages 直接编译 workspace 源码，避免依赖 shared 先 build
const nextConfig: NextConfig = {
  transpilePackages: ["@g-heal-claw/shared"],
  reactStrictMode: true,
  // 菜单重构（ADR-0021）：所有菜单按一级分组（dashboard/monitor/tracking/settings）归类
  // URL 新增分组前缀；保留 301 永久重定向，避免旧文档/书签失效
  async redirects() {
    // 旧 → 新路由映射表
    const moves: ReadonlyArray<readonly [string, string]> = [
      // Dashboard 组
      ["overview", "dashboard/overview"],
      ["realtime", "dashboard/realtime"],
      // 监控中心组
      ["errors", "monitor/errors"],
      ["performance", "monitor/performance"],
      ["api", "monitor/api"],
      ["visits", "monitor/visits"],
      ["resources", "monitor/resources"],
      ["logs", "monitor/logs"],
      // 埋点分析组
      ["custom", "tracking/custom"],
      // 系统设置组（/projects 历史迁移）
      ["projects", "settings/projects"],
    ];

    return moves.flatMap(([from, to]) => [
      { source: `/${from}`, destination: `/${to}`, permanent: true },
      { source: `/${from}/:path*`, destination: `/${to}/:path*`, permanent: true },
    ]);
  },
};

export default nextConfig;
