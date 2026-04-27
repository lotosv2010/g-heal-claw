# @g-heal-claw/web

g-heal-claw 管理后台（Next.js 16 App Router）。

## 本期范围（T1.1.6 / ADR-0012 + ADR-0015 + ADR-0016）

- 10 页路由骨架全部铺齐：数据总览 / 页面性能 / 日志查询 / 异常分析 / 页面访问 / API 监控 / 静态资源 / 自定义上报 / 通信监控 / 应用管理
- **"页面性能" + "异常分析"** 两页实现完整 live UI：
  - `/performance`（ADR-0015）：Web Vitals 卡 + 加载阶段条 + 24h 趋势 + Top 10 慢页面
  - `/errors`（ADR-0016）：总览卡（总事件/影响会话/环比）+ 子类型占比环（纯 CSS `conic-gradient`）+ 24h 三系列趋势 + Top N 分组表
- 数据均来自 `apps/server` 的 `/dashboard/v1/{performance,errors}/overview`
- 其余 8 页为 `PlaceholderPage` 占位，标注后续 Phase

## 已落地

- 图表：`@ant-design/plots`（AntV G2） Line 组件 — 性能页 p75（LCP/FCP/INP/TTFB）+ 异常页事件数（js/promise/resource）
- 环形占比：纯 CSS `conic-gradient`（不引图表库，`/errors` 子类型分布）
- 时间格式化：dayjs（UTC ISO → 浏览器本地 `HH:00` / `MM-DD HH:mm`）
- 数据源：`/dashboard/v1/performance/overview` + `/dashboard/v1/errors/overview` + `NEXT_PUBLIC_DEFAULT_PROJECT_ID=demo` + `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`
- 三态展示：`live / empty / error` 通过 Badge variant 区分（异常页 up=destructive=恶化、down=good=改善；性能页 up=destructive=延迟增大）

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
    performance/       # ✅ 本期完整落地（ADR-0015）
    errors/            # ✅ 本期完整落地（ADR-0016）
    {8 个占位页}/
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
