# ADR-0012: apps/web 管理后台骨架（Next.js + 10 页路由 + 仅实现页面性能）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-27 |
| 决策人 | @gaowenbin |

## 背景

T1.1.3 / T1.1.4 / T1.2.1 已完成（shared / sdk / server / examples 链路打通）。`apps/web`
管理后台作为 RUM 数据消费端，必须在 `apps/server` Dashboard API（T1.6.x，尚未开工）
就位之前建立**稳定的前端地基**——包括工程骨架、路由布局、视觉体系和通用 UI 基座。

本次交付的边界由用户明确：

> "目录结构搭建完成，功能本期只实现页面性能"

即：10 个功能页的**路由骨架全部铺齐**，但只有 **页面性能（performance）** 一页落地
完整的卡片 + 趋势图 + 明细表格 UI 与 mock 数据；其余 9 页只有"待开发"占位页。

约束：

- `.claude/rules/architecture.md`：`apps/web` 只能依赖 `shared` + react/next 生态；
  禁止依赖 `apps/server` 源码、`nestjs`、`bullmq`
- `.claude/rules/coding.md §Next.js 约定`：App Router + 服务端组件优先、Shadcn/ui、Tailwind v4
- 后端 Dashboard API 全部未实现，性能页的数据通过 `lib/api/*` 抽象层返回 **mock fixture**，
  真实端点预留 TODO 注释；**禁止**在 web 里直连 DB / Redis
- 不引入 JWT 登录（推迟到 T1.1.7）——本期所有页面默认可访问，顶栏放置一个占位的"切换
  项目"下拉（静态数据）作为多项目上下文的视觉锚点
- 10 页命名与用户列出的顺序严格对齐

### 10 页命名对照（需求冲突消解）

| 用户命名 | 路由 slug | PRD 映射 | 对应后端事件类型 | 本期落地 |
|---|---|---|---|---|
| 数据总览 | `overview` | §4 概览 | 聚合指标 | 占位页 |
| **页面性能** | **`performance`** | **§2.1** | **`performance` + `long_task`** | **✅ 完整骨架 + mock** |
| 日志查询 | `logs` | §2.6（日志） | `custom_log` | 占位页 |
| 异常分析 | `errors` | §2.2 | `error` → issues | 占位页 |
| 页面访问 | `visits` | §2.4 | `page_view` + `page_duration` | 占位页 |
| API 监控 | `api` | §2.3 | `api` | 占位页 |
| 静态资源 | `resources` | §2.5 | `resource` | 占位页 |
| 自定义上报 | `custom` | §2.6 | `custom_event`+`custom_metric`+`track` | 占位页 |
| 通信监控 | `realtime` | *PRD 未定义* | WebSocket/SSE/postMessage（待 SPEC 补齐） | 占位页 |
| 应用管理 | `projects` | §3 多环境 | projects / keys / members | 占位页 |

> 命名决策：
> - "通信监控" 默认按 **WebSocket/SSE/postMessage 连接监控** 建 `realtime` 目录，独立于
>   `api`（避免与 §2.3 重复）；具体事件 Schema 待后续 ADR 补齐。
> - "日志查询" 作为独立一级页 `logs`，与 `custom` 并列，避免 tab 嵌套。

## 决策

### 1. 技术栈（与 `examples/nextjs-demo` 对齐，避免分叉）

| 项 | 选择 |
|---|---|
| 框架 | Next.js ^16（App Router，turbopack dev） |
| React | ^19 |
| 样式 | TailwindCSS v4（通过 `@tailwindcss/postcss`） |
| 组件基座 | **真实 shadcn/ui**（手动粘贴 canonical 源码，不跑 `shadcn init` CLI；基于 Tailwind v4 + React 19 的最新模板）。本期落地 Button / Card / Badge / Table / Tabs / Skeleton 六件套，后续按需扩展 |
| 图表 | **echarts-for-react**（延后 1 个任务引入；本期性能页先用 HTML/CSS 趋势条代替，避免一次性拉入大依赖） |
| 状态管理 | **不引入**（服务端组件 + URL 参数 + React Context，YAGNI） |
| 请求客户端 | 原生 `fetch`，封装在 `lib/api/http.ts`；默认返回 mock fixture |
| 端口 | **3000**（对齐 `.env.example` 的 `WEB_PORT=3000` 与 `PUBLIC_WEB_BASE_URL`） |

**组件基座采用真实 shadcn/ui 的理由**（本决策初稿为"手写精简版"，经用户要求更正为真实 shadcn）：
- shadcn/ui 是业界事实标准，设计 token、可访问性（ARIA）、焦点管理已内化到组件；自己手写难以覆盖 ARIA 细节
- shadcn 源码是"拥有"式（粘贴到仓库而非 npm 安装），可直接修改，未来无版本冲突
- 依赖成本可控：本期 6 件套仅需 `@radix-ui/react-slot` + `@radix-ui/react-tabs` 两个 Radix 子包，加上 `cva` `clsx` `tailwind-merge` `lucide-react` `tw-animate-css`，总计约 8 个轻量包
- 不跑 `shadcn init` CLI 的理由：该 CLI 会修改 `tsconfig.json` / `next.config.ts` / `globals.css` 等多处，且依赖交互式输入；手动粘贴 canonical 源码更可控且等价

**不引入 ECharts 的理由**：echarts 压缩后 ~1MB（treeshake 后 ~300KB），本期只有性能页一张
趋势图，用 CSS flex + 渐变色条可完全表达"趋势"意图；第一个真实数据源接入（T2.1.7）时再
引 echarts-for-react，集中一次验证。

### 2. 目录结构

```
apps/web/
├── app/
│   ├── (dashboard)/                     # 路由组：统一挂左侧菜单 + 顶栏
│   │   ├── layout.tsx                   # 面板外壳：Sidebar + Topbar + 内容区
│   │   ├── overview/page.tsx            # 占位
│   │   ├── performance/                 # ✅ 本期落地
│   │   │   ├── page.tsx                 # 服务端组件：并发读 mock
│   │   │   ├── vitals-cards.tsx        # 客户端卡片组
│   │   │   ├── trend-chart.tsx          # CSS 趋势条（暂代 ECharts）
│   │   │   └── slow-pages-table.tsx     # 慢页面 Top 表格
│   │   ├── logs/page.tsx                # 占位
│   │   ├── errors/page.tsx              # 占位
│   │   ├── visits/page.tsx              # 占位
│   │   ├── api/page.tsx                 # 占位
│   │   ├── resources/page.tsx           # 占位
│   │   ├── custom/page.tsx              # 占位
│   │   ├── realtime/page.tsx            # 占位（"通信监控"）
│   │   └── projects/page.tsx            # 占位
│   ├── layout.tsx                       # 根 layout（字体 / <html> / 全局样式）
│   ├── page.tsx                         # "/" → redirect("/performance")
│   └── globals.css                      # Tailwind 入口
├── components/
│   ├── ui/                              # 手写 Shadcn 风格原语
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   └── skeleton.tsx
│   └── dashboard/
│       ├── sidebar.tsx                  # 10 条菜单
│       ├── topbar.tsx                   # 项目切换占位 + 时间范围下拉占位
│       └── page-header.tsx              # 页面标题 + 副标题 + 右侧操作插槽
├── lib/
│   ├── cn.ts                            # classname 合并（本地 clsx 替代）
│   ├── nav.ts                           # 10 个菜单项元数据（单一事实源）
│   ├── api/
│   │   ├── http.ts                      # fetch 包装（mock 开关 + 错误归一）
│   │   └── performance.ts               # 性能页专用 API（mock fixture）
│   └── fixtures/
│       └── performance.ts               # 性能页 mock 数据
├── global.d.ts                          # CSS module 声明
├── next.config.ts                       # transpilePackages: shared
├── next-env.d.ts
├── postcss.config.mjs                   # Tailwind v4
├── tsconfig.json                        # 与 demo 对齐（TS ~6.0.3）
├── package.json
├── .env.example                         # NEXT_PUBLIC_API_BASE_URL 等
├── .gitignore
└── README.md
```

### 3. 性能页视觉与数据契约（UI 层，独立于后端形状）

性能页展示四部分，对齐 PRD §2.1：

1. **Core Web Vitals 卡片区**：LCP / FCP / CLS / INP / TTFB 五张卡，含数值 / 阈值
   颜色（良好/需改进/差）/ 环比箭头
2. **页面加载阶段条形图**：DNS / TCP / SSL / 请求 / 响应 / DOM 解析 / 资源加载，按比例
   展示耗时（CSS flex）
3. **趋势条**（代替 ECharts）：过去 24 小时 LCP p75 趋势的简化 CSS 柱状
4. **慢页面 Top 10 表格**：URL / 采样数 / LCP p75 / TTFB p75 / 跳出率

UI 层的数据形状声明在 `lib/api/performance.ts` 的 TypeScript 类型里，**不**引入 Zod
（web 不在契约边界上，Zod 留给 server ↔ shared）。mock fixture 返回符合类型的静态对象，
每次调用等价纯函数（便于后续替换）。

### 4. 菜单元数据（nav.ts）

单一事实源，Sidebar 和 Topbar 都从此读取：

```typescript
export const NAV = [
  { slug: "overview",    label: "数据总览", icon: "⊞" },
  { slug: "performance", label: "页面性能", icon: "⌁" },
  { slug: "logs",        label: "日志查询", icon: "📝" },
  { slug: "errors",      label: "异常分析", icon: "⚠" },
  { slug: "visits",      label: "页面访问", icon: "⇆" },
  { slug: "api",         label: "API 监控", icon: "⇌" },
  { slug: "resources",   label: "静态资源", icon: "⊟" },
  { slug: "custom",      label: "自定义上报", icon: "⊕" },
  { slug: "realtime",    label: "通信监控", icon: "⟳" },
  { slug: "projects",    label: "应用管理", icon: "⚙" },
] as const;
```

图标本期用 Unicode 符号，避免引入 lucide-react 等图标包。

### 5. 占位页统一形态

9 个占位页共享一个 `PlaceholderPage` 组件：

```tsx
export default function Page() {
  return <PlaceholderPage title="日志查询" phase="Phase 3" />;
}
```

展示标题 + 副标题 + "此功能将于 Phase X 落地" 提示。

## 备选方案

### 备选 A：只建路由骨架，不做性能页 UI
**否定**：用户明确要求"功能本期只实现页面性能"，即性能页要有完整 UI。

### 备选 B：手写 Shadcn 风格精简原语
**初选采纳 → 后被覆盖**：手写可避免 Radix 依赖，但 ARIA/可访问性与设计 token
很难与 shadcn 生态长期对齐；且 shadcn canonical 源码本就是"拥有"式（复制到仓库），
依赖成本比预估低得多。最终改为真实 shadcn/ui。

### 备选 C：性能页直接集成 echarts-for-react
**否定**：echarts 体积大（~1MB raw），且本期无真实数据。延后到 T2.1.7（性能页完整功能
落地、接入真实 metric_minute 聚合）时一次性集成。

### 备选 D：引入 Zustand / Jotai 状态管理
**否定**：App Router + Server Components + URL searchParams 已足够，YAGNI。

### 备选 E：引入 NextAuth + JWT 登录
**否定**：T1.1.7 专门任务，本期推迟。

## 影响

### 成本
- 新增 ~25 个文件（约 1500 行 TypeScript / TSX），主要是路由页、6 个 UI 原语、Sidebar/Topbar
- `pnpm install` 新增：`next@^16` `react@^19` `tailwindcss@^4` `@tailwindcss/postcss@^4`（与 demo 重复但各自独立 node_modules，pnpm 会硬链接共用）
- 首次 `pnpm -F @g-heal-claw/web build` 产物 ~500KB（仅壳 + 性能页，压缩后）

### 收益
- 管理后台的**路由拓扑**一次性冻结：后续 T1.6.x / T2.1.7 等任务只需往对应 slug 下填充
  页面内容，不需要修改导航和外壳
- 性能页的 UI 契约（`lib/api/performance.ts` 类型）作为 T2.1.6 "性能大盘 API" 的消费者
  预先声明，后端 API 设计时可直接对齐
- 与 `examples/nextjs-demo` 共享相同的 Next/React/Tailwind 版本，保证 workspace 一致

### 风险
- **风险 1**：性能页 mock fixture 的数据形状可能与后续真实 API 不完全一致
  - **缓解**：`lib/api/performance.ts` 的类型与 fixture 分离，API 落地后只改
    fetch 调用，不改组件
- **风险 2**：CSS 趋势条无法表达复杂交互（缩放 / tooltip / 多系列对比）
  - **缓解**：已在 ADR 声明 ECharts 延后集成；本期仅验证布局与视觉，完整交互属于 T2.1.7
- **风险 3**：9 个占位页若长期不落地，会造成视觉"死链"感
  - **缓解**：占位页明确标注"Phase X 交付"，与 `docs/tasks/CURRENT.md` 路线图对齐

### 架构红线核验
- ✅ `apps/web` 只依赖 `packages/shared`（若需要）+ react/next 生态，不依赖 `apps/server`
- ✅ 不引入 `nestjs` / `bullmq` / `drizzle`
- ✅ 不直连数据库 / Redis
- ✅ 环境变量通过 `NEXT_PUBLIC_*` 前缀（本期仅 `NEXT_PUBLIC_API_BASE_URL` 占位）

## 后续

- **T1.1.6** 将在此 ADR 指导下拆解为 10 个子任务，详见 `docs/tasks/CURRENT.md`
- 后续 `apps/server` Dashboard API 落地时（T1.6.x / T2.1.6），替换 `lib/api/performance.ts`
  中的 mock 为真实 fetch 即可，不动组件
- "通信监控 / realtime" 对应的事件类型与 SPEC 章节需独立 ADR（如 ADR-0013）补齐，在此
  之前该页保持占位
- ECharts 集成在 T2.1.7 落地
- 认证与项目切换在 T1.1.7 落地（当前顶栏的"项目切换"下拉为静态占位）
