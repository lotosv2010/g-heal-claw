# @g-heal-claw/web

g-heal-claw 管理后台（Next.js 16 App Router）。

## 本期范围（T1.1.6 / ADR-0012）

- 10 页路由骨架全部铺齐：数据总览 / 页面性能 / 日志查询 / 异常分析 / 页面访问 / API 监控 / 静态资源 / 自定义上报 / 通信监控 / 应用管理
- **仅"页面性能"** 实现完整 UI（Web Vitals 卡 + 加载阶段条 + 24h 趋势 + Top 10 慢页面），数据来自 `apps/server` 的 `/dashboard/v1/performance/overview`（ADR-0015）
- 其余 9 页为 `PlaceholderPage` 占位，标注后续 Phase

## 已落地

- 图表：`@ant-design/plots`（AntV G2） Line 组件 — 趋势图多系列 p75（LCP/FCP/INP/TTFB）
- 时间格式化：dayjs（UTC ISO → 浏览器本地 `HH:00`）
- 数据源：`/dashboard/v1/performance/overview`（ADR-0015）+ `NEXT_PUBLIC_DEFAULT_PROJECT_ID=demo` + `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`
- 三态展示：`live / empty / error` 通过 Badge variant 区分

## 非目标

- 不引入 JWT 登录（T1.1.7）
- 不引入 ECharts（重度定制延后至 T2.1.7 评估）
- 环比时间窗 / 分页面瀑布图 / 深度定制留给 T2.1.7
- 认证 / 项目切换器留给 T1.1.7

## 本地开发

```bash
pnpm -F @g-heal-claw/web dev        # http://localhost:3000 → 重定向至 /performance
pnpm -F @g-heal-claw/web typecheck
pnpm -F @g-heal-claw/web build
```

## 目录

```
app/
  (dashboard)/         # 路由组：统一挂 Sidebar + Topbar
    performance/       # ✅ 本期完整落地
    {9 个占位页}/
  layout.tsx           # 根 layout
  page.tsx             # "/" → redirect("/performance")
  globals.css          # Tailwind v4 入口
components/
  ui/                  # 手写 Shadcn 风格原语：Button / Card / Badge / Table / Tabs / Skeleton
  dashboard/           # Sidebar / Topbar / PageHeader / PlaceholderPage
lib/
  nav.ts               # 10 条菜单单一事实源
  cn.ts                # classname 合并
  api/                 # 后端 Dashboard API fetch 包装
```
