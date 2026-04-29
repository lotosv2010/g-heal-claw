# 任务跟踪

> 最后更新: 2026-04-29（ADR-0020 菜单完整化交付路线图注册；下阶段主题切换为 "菜单完整性"，按 Tier 1/2/3 推进 8 个占位页 → live；T1.3.6 k6 + T1.4.3 HLL 保持）

## 状态说明

- `[ ]` 待开始
- `[~]` 进行中
- `[x]` 已完成
- `[-]` 已跳过/推迟

任务编号规则：`T<Phase>.<Milestone>.<Seq>`。工时为人日估算，含联调测试。

---

## 当前状态快照

| 维度 | 状态 |
|---|---|
| 仓库结构 | Monorepo 脚手架已就绪（`pnpm-workspace.yaml` + `turbo.json` + `tsconfig.base.json`） |
| 基础设施 | Docker Compose：PostgreSQL 17 + Redis 7 + MinIO 可用 |
| 应用子目录 | `apps/server` 已初始化（ADR-0011）；`apps/web` 已初始化（ADR-0012，shadcn/ui + `(console)/` 4 分组菜单 + 性能 / 错误 / API / 资源 / 访问 / 埋点事件大盘 live）；`apps/ai-agent` 尚未初始化 |
| 包子目录 | `packages/shared` `packages/sdk` 已初始化并构建；`packages/cli` `packages/vite-plugin` `packages/miniapp-sdk` 尚未初始化 |
| 文档 | `docs/SPEC.md` `docs/ARCHITECTURE.md` `docs/DESIGN.md` 已对齐 `docs/PRD.md` v2 |

## 范围决策（MVP 取舍）

下列 PRD 功能点经过评估，**明确纳入后续阶段或剔除**：

| PRD 条款 | 决策 | 说明 |
|---|---|---|
| §2.7 **可视化埋点圈选** | Phase 6 纳入（评审） | 依赖独立的 Chrome 扩展 + 可视化配置后台，MVP 先用 `data-track` + 代码埋点满足 95% 需求 |
| §3 **短信告警** | Phase 4 纳入 | 内置阿里云短信 / 腾讯云短信适配，但需要业务方提供签名与模板 |
| §3 **移动端 App（Native）** | 明确推迟至 P2 之后 | MVP 仅支持 Web / H5 / 小程序；Native 走 Hybrid WebView + H5 SDK 即可覆盖初期需求，独立 Native SDK 视流量再启动 |
| §2.5 **资源大小按类型聚合** | Phase 3 补齐 | 已在 ResourceProcessor 产出聚合，需要大盘 UI 透出 |
| §3 **API 开放 / 数据导出** | Phase 6 补齐 | `/open/v1/metrics/query` 之外新增批量导出接口（CSV/JSONL） |

---

## 路线图总览

| Phase | 目标 | 估时 |
|---|---|---|
| Phase 1 | 基础设施 + SDK 核心 + 异常监控 MVP | 6 周 |
| Phase 2 | 性能监控 + API 监控 + 访问分析 | 4 周 |
| Phase 3 | 资源监控 + 自定义上报 + 埋点 | 3 周 |
| Phase 4 | 告警引擎 + 通知渠道 | 2 周 |
| Phase 5 | AI 诊断 + 自愈 PR | 4 周 |
| Phase 6 | 看板完善 + 开放 API + 小程序 SDK | 3 周 |

---

## Phase 1：基础设施 + 异常监控 MVP

**目标**：SDK 捕获异常 → Gateway 入队 → Processor 聚合 Issue → Sourcemap 还原堆栈 → Dashboard 展示。

### M1.1 项目脚手架

- [x] **T1.1.1** Monorepo 初始化（pnpm workspace + Turborepo + tsconfig）— 2d
- [x] **T1.1.2** Docker Compose（PostgreSQL + Redis + MinIO）— 2d
- [x] **T1.1.3** `apps/server` 初始化（NestJS + Fastify adapter + 模块骨架 + 环境变量 Zod 校验）— 2d（完成 2026-04-27，依据 ADR-0011）
  - [x] **T1.1.3.1** 应用脚手架：`apps/server/package.json` / `tsconfig.json` / `tsconfig.build.json` / `nest-cli.json` / `.gitignore` / `README.md`；新增依赖 `@nestjs/*` `fastify@^4.28.1` `@fastify/cors@^9` `@fastify/static@^7` `dotenv-flow` `reflect-metadata` `rxjs`
  - [x] **T1.1.3.2** `src/config/env.ts` + `config.module.ts`：`dotenv-flow` 显式指向 monorepo 根加载 → `parseEnv(ServerEnvSchema, process.env)` → `SERVER_ENV` DI token 全局注入；失败打印字段级错误并 `exit(1)`
  - [x] **T1.1.3.3** `src/shared/shared.module.ts`（@Global，骨架阶段仅 Logger 占位）+ `src/shared/pipes/zod-validation.pipe.ts`（通用 ZodValidationPipe，抛 `BadRequestException`）
  - [x] **T1.1.3.4** `src/health/*`：`GET /healthz` → `{ status: "ok" }`；不校验外部依赖
  - [x] **T1.1.3.5** `src/gateway/*`：`POST /ingest/v1/events`，`@UsePipes(new ZodValidationPipe(IngestRequestSchema))`，骨架 Service 仅打日志 + 返回 `{ accepted: events.length }`；附 `@nestjs/swagger` 装饰器
  - [x] **T1.1.3.6** `src/app.module.ts` + `src/main.ts`：Fastify adapter、`enableCors({ origin: [PUBLIC_WEB_BASE_URL, "http://localhost:3100"] })`、Swagger 挂 `/docs`（非 prod）、监听 `SERVER_PORT`
  - [x] **T1.1.3.7** 单测 + e2e：`gateway.service.spec.ts`（1 用例）+ `test/gateway.e2e-spec.ts`（4 用例：合法 200 / 非法 400 / CORS preflight 204 / `/healthz` 200），通过 `unplugin-swc` + `.swcrc` 保证 Vitest 下装饰器元数据
  - [x] **T1.1.3.8** 根 `.env` 引导：已创建 `.env`（由 `.env.example` 复制），`pnpm install` → `pnpm typecheck` / `pnpm test` 6/6 + 5/5 全绿
  - [x] **T1.1.3.9** 端到端验证：`curl /healthz` = 200 `{"status":"ok"}`；`curl POST /ingest/v1/events` 合法 200 `{"accepted":1}`、空数组 400、CORS preflight（origin=`http://localhost:3100`）204；demo 3 按钮 → server 日志 `accepted=1`
- [x] **T1.1.4** `packages/shared` 初始化（Zod Schema + 队列名常量 + 通用工具）— 2d（完成 2026-04-27，依据 ADR-0009）
  - [x] **T1.1.4.1** 包脚手架（`package.json` / `tsconfig.json` / 目录骨架，仅依赖 zod）
  - [x] **T1.1.4.2** Env Schema：BaseEnvSchema / ServerEnvSchema / AiAgentEnvSchema + `parseEnv` 纯函数（对齐 `.env.example` 11 段）
  - [x] **T1.1.4.3** BullMQ 队列名常量（对齐 `ARCHITECTURE §3.4` 12 条 + DLQ 派生）
  - [x] **T1.1.4.4** Event 基础 Schema（BaseEvent + Breadcrumb + NavigationTiming，对齐 `SPEC §4.1` / §4.1.1 / §4.2.1）
  - [x] **T1.1.4.5** Event 子类型 Schema 11 种（error / performance / long_task / api / resource / page_view / page_duration / custom_event / custom_metric / custom_log / track）
  - [x] **T1.1.4.6** 判别联合 `SdkEventSchema` + `IngestRequestSchema` + `src/index.ts` 桶式导出
  - [x] **T1.1.4.7** Vitest 单测（parseEnv 失败分支 + Schema 判别联合 + 队列名冻结性，25 个 case 全绿）
  - [x] **T1.1.4.8** 验证 `pnpm -F @g-heal-claw/shared build && typecheck && test`，更新 `.claude/rules/coding.md`（纯类型包使用 tsc 的例外）
- [x] **T1.1.5** Drizzle Schema 首版基线（依据 ADR-0017，多租户主表 8 张 + events_raw 周分区骨架 + drizzle-kit 迁移源真值；不落 Controller/Service/Guard）— 2.8d（完成 2026-04-28）
  - [x] **T1.1.5.1** `packages/shared` 新增 `id.ts` 纯函数 + `nanoid@^5` 依赖 —— `generateId(prefix)` + 7 条前缀常量；8 case 单测（前缀 / 长度 / 字符集 / 10k 唯一性 / 空 prefix 拒绝 / 非法 prefix 拒绝 / 多前缀并存 / ID_PREFIXES 常量）全绿
  - [x] **T1.1.5.2** apps/server devDependency 扩容 + `drizzle.config.ts` —— `drizzle-kit@^0.30` + `nanoid@^5` (runtime)；`drizzle.config.ts` glob 指向 `schema/*.ts`；pnpm 脚本 `db:generate` / `db:migrate` / `db:studio`
  - [x] **T1.1.5.3** Schema 拆分 —— `schema/` 下 7 个 .ts 文件（users / projects / releases / issues / events-raw / perf-events-raw / error-events-raw；projects.ts 含 projects + project_keys + project_members + environments 4 子表）；`schema.ts` 改为桶式 re-export，errorsService / performanceService 不改动
  - [x] **T1.1.5.4** `events_raw` 分区父表 + 4 张周分区 DDL —— `schema/events-raw.ts` 用 Drizzle composite PK；分区 DDL 在 `ddl.ts` 手写（Drizzle 不支持 PARTITION BY 原生 DSL）；2026w17 ~ 2026w20 四张子分区
  - [x] **T1.1.5.5** `ddl.ts` 组合 —— MAIN_DDL (15 条) + PERFORMANCE_DDL (4 条) + ERROR_DDL (4 条) + EVENTS_RAW_DDL (7 条) = `ALL_DDL` 30 条；FK 顺序 users → projects → others 严格保证
  - [x] **T1.1.5.6** 手写 `drizzle/0001_initial.sql` —— drizzle-kit 0.30 CJS 加载器与 NodeNext `.js` 扩展不兼容 + PARTITION BY 分区 DDL 不支持原生生成 → 按 ADR-0017 §2 "本期手写对齐" 方案落地；`drizzle/README.md` 记录执行方式与已知限制
  - [x] **T1.1.5.7** 端到端验证 + 文档收尾 —— `pnpm -r typecheck` 全绿（5 workspace projects）；shared 33 tests + server 8 unit tests 全绿；SPEC §9 拆分为 9.1 已落地基线 + 9.2 规划表；ARCHITECTURE §8.1 新增 §8.1.1 Schema 基线小节
- [x] **T1.1.6** `apps/web` 初始化（Next.js App Router + shadcn/ui + 10 页路由骨架 + 仅落地"页面性能"）— 2d（完成 2026-04-27，依据 ADR-0012）
  - [x] **T1.1.6.1** 应用脚手架：`package.json`（Next 16 + React 19 + Tailwind v4 + TS ~6.0.3，端口 3000）/ `tsconfig.json` / `next.config.ts`（`transpilePackages: ["@g-heal-claw/shared"]`）/ `next-env.d.ts` / `global.d.ts` / `postcss.config.mjs` / `.gitignore` / `.env.example`（`NEXT_PUBLIC_API_BASE_URL`） / `README.md`
    - 输入：`examples/nextjs-demo` 已有的 Next 16 + TS 6 模板
    - 输出：`apps/web/` 下脚手架文件全量创建，`pnpm install` 通过
    - 验收：`pnpm -F @g-heal-claw/web typecheck` 通过（空项目级）
    - 依赖：无
  - [x] **T1.1.6.2** 全局样式与根布局：`app/globals.css`（Tailwind v4 入口 + shadcn OKLCH 主题 + `@theme inline` token 映射 + 自定义 `good/warn/brand` 语义色）/ `app/layout.tsx`（HTML 骨架、中文字体、`<body>` 类名）/ `app/page.tsx`（根路径 `redirect("/performance")`）
    - 输入：T1.1.6.1
    - 输出：根布局就绪，"/" 能重定向至 `/performance`
    - 验收：`pnpm dev` 访问 `http://localhost:3000` 重定向生效
    - 依赖：T1.1.6.1
  - [x] **T1.1.6.3** UI 原语（真实 shadcn/ui new-york，含 Radix Slot/Tabs + cva + clsx/tailwind-merge + lucide-react + tw-animate-css）：`components.json` / `components/ui/button.tsx` / `card.tsx` / `badge.tsx`（扩展 good/warn/brand variant）/ `table.tsx` / `tabs.tsx` / `skeleton.tsx` + `lib/utils.ts`（canonical `cn = twMerge(clsx(inputs))`）
    - 输入：T1.1.6.2
    - 输出：6 个 UI 原语 + `cn()` 工具函数
    - 验收：`typecheck` 通过；组件导出类型完整
    - 依赖：T1.1.6.2
  - [x] **T1.1.6.4** 菜单与外壳：`lib/nav.ts`（10 条菜单元数据单一事实源，`icon: LucideIcon`）/ `components/dashboard/sidebar.tsx`（左侧 10 条菜单 + lucide 图标 + 当前路由高亮）/ `components/dashboard/topbar.tsx`（项目切换下拉占位 + 时间范围下拉占位，使用 shadcn Button + lucide 图标）/ `components/dashboard/page-header.tsx`（页面标题 + 副标题 + 操作区插槽）
    - 输入：T1.1.6.3
    - 输出：Dashboard 外壳可复用
    - 验收：Sidebar 菜单 10 项显示正确，当前路由 active 样式生效
    - 依赖：T1.1.6.3
  - [x] **T1.1.6.5** Dashboard 路由组：`app/(dashboard)/layout.tsx` 组合 Sidebar + Topbar + 内容区；`components/dashboard/placeholder-page.tsx` 通用占位组件（标题 / 副标题 / `Badge variant="brand"` "Phase X 交付"）
    - 输入：T1.1.6.4
    - 输出：Dashboard layout 就绪，PlaceholderPage 可复用
    - 验收：访问任意 slug 页面都能看到外壳
    - 依赖：T1.1.6.4
  - [x] **T1.1.6.6** 9 个占位页：`app/(dashboard)/{overview,logs,errors,visits,api,resources,custom,realtime,projects}/page.tsx`，每个 3 行：调用 `<PlaceholderPage title="..." phase="Phase X" />`
    - 输入：T1.1.6.5
    - 输出：9 个占位页路由可访问
    - 验收：10 条菜单点击均能渲染对应页面（9 占位 + 1 性能占位，性能页将在 T1.1.6.7/8/9 中填充）
    - 依赖：T1.1.6.5
  - [x] **T1.1.6.7** 性能页数据层：`lib/api/performance.ts`（类型定义含 `ThresholdTone = "good" | "warn" | "destructive"` + `getPerformanceOverview()`）/ `lib/fixtures/performance.ts`（5 Web Vitals + 加载阶段 + 24h 趋势 + Top 10 慢页面 静态 mock）
    - 输入：T1.1.6.5
    - 输出：性能页数据契约与 mock fixture 就绪；真实 API 端点在注释中 TODO
    - 验收：`getPerformanceOverview()` 纯函数返回符合类型的 mock
    - 依赖：T1.1.6.5
  - [x] **T1.1.6.8** 性能页 UI 组件：`app/(dashboard)/performance/vitals-cards.tsx`（5 张 Web Vitals 卡，shadcn Card + Badge `variant={tone}`）/ `trend-chart.tsx`（CSS flex 趋势条，`bg-brand`/`bg-warn` 着色，代替 ECharts）/ `page-stages-bars.tsx`（页面加载 7 阶段条形图）/ `slow-pages-table.tsx`（Top 10 慢页面 shadcn Table + Badge 阈值色）
    - 输入：T1.1.6.3 / T1.1.6.7
    - 输出：4 个客户端组件
    - 验收：组件独立可渲染（Storybook-less 验证：在 page.tsx 集成后肉眼核对）
    - 依赖：T1.1.6.3, T1.1.6.7
  - [x] **T1.1.6.9** 性能页组装：`app/(dashboard)/performance/page.tsx`（服务端组件，读 mock → 传递给 4 个客户端组件；PageHeader actions 用 `<Badge variant="warn">`）
    - 输入：T1.1.6.8
    - 输出：完整性能页路由可用
    - 验收：访问 `/performance` 看到 Web Vitals 卡 + 加载阶段条 + 24h 趋势 + Top 10 表格
    - 依赖：T1.1.6.8
  - [x] **T1.1.6.10** 端到端验证（2026-04-27）：`typecheck` 通过；`build` 13 个静态页生成；`dev` 启动后 `GET /` → HTTP 307 → `/performance` 200，其余 9 个占位页 GET 均 200；自定义 utility `bg-warn / bg-brand / bg-good` 在产物 HTML 中出现。注：`lint` 因 Next 16 删除 `next lint` 暂用 placeholder（待 T1.1.7 统一接入 ESLint flat config）
    - 输入：T1.1.6.9
    - 输出：web app 可独立开发与构建
    - 验收：typecheck / build 通过；10 条菜单全部可达
    - 依赖：T1.1.6.9
- [ ] **T1.1.7** 认证与项目管理 MVP（JWT 登录、项目 CRUD、成员 RBAC、API Token 管理）— 4d
- [ ] **T1.1.8** CI 流水线（Turbo + Lint + Test + Build）— 1d

### M1.2 SDK 核心

- [x] **T1.2.1** SDK 骨架（`GHealClaw.init()`、DSN 解析、Hub、Plugin 接口）— 2d（依据 ADR-0010，完成于 2026-04-27）
  - [x] **T1.2.1.1** workspace 扩展：`pnpm-workspace.yaml` 纳入 `examples/*`
  - [x] **T1.2.1.2** SDK 包脚手架（`package.json` / `tsconfig.json` / `vite.config.ts` 双格式 + dts 插件 / `vitest.config.ts`）
  - [x] **T1.2.1.3** `parseDsn` 纯函数 + 单测（happy / 无效格式 / 缺 projectId）
  - [x] **T1.2.1.4** `Hub` 单例（setUser / setTag / setContext / breadcrumb 环形缓冲 / getScope / resetHub）
  - [x] **T1.2.1.5** `Plugin` 接口 + `PluginRegistry`（注册/去重/setup 失败隔离）
  - [x] **T1.2.1.6** `createEvent` 事件构造（BaseEvent 最小字段：device/page/session，使用 shared 类型）
  - [x] **T1.2.1.7** `FetchTransport` 占位（单事件 POST `/ingest/v1/events`，keepalive=true，吞错不抛）
  - [x] **T1.2.1.8** 公开 API：`init` / `captureMessage` / `captureException` / `addBreadcrumb` / `getCurrentHub`
  - [x] **T1.2.1.9** SDK 单测（Hub / Plugin / createEvent / FetchTransport mock — 19 用例全绿）
  - [x] **T1.2.1.10** examples/nextjs-demo 脚手架（Next.js 15 App Router + Tailwind v4 + GhcProvider + 3 个测试按钮）
  - [x] **T1.2.1.11** 端到端验证：`pnpm build/typecheck/test` 全绿；SDK 体积 2.73KB gzip（预算 15KB）；Next.js 生产构建成功。浏览器运行时观测需本地 `pnpm -F nextjs-demo dev` 后打开 <http://localhost:3100> 手动验证
- [ ] **T1.2.2** ErrorPlugin（`window.onerror` + `unhandledrejection` + 静态资源错误）— 1.5d（依据 ADR-0016，MVP 范围：不含 Breadcrumb 自动采集 / Sourcemap / 指纹）
  - [x] **T1.2.2.1** 堆栈解析器（完成 2026-04-27，9/9 单测绿） `src/plugins/stack-parser.ts`：纯函数 `parseStack(stack: string): StackFrame[]`，正则覆盖 V8 `at fn (file:line:col)` + Firefox `fn@file:line:col`，≤ 20 帧，解析失败返回 `[]`；≥ 8 单测 case — 0.3d
    - 输入：ADR-0016 §1
    - 输出：`stack-parser.ts` + `stack-parser.test.ts`
    - 验收：V8/FF/Safari/匿名函数/eval 各 1 case 通过；无副作用
    - 依赖：无
  - [x] **T1.2.2.2** `src/plugins/error.ts` 核心实现：`errorPlugin(opts)` 工厂 + 三路订阅（error 冒泡 / error 捕获 / unhandledrejection）+ `WeakSet<Event>` 去重 + `ignoreErrors` 过滤 + 映射到 `ErrorEventSchema` — 0.5d（完成 2026-04-27）
    - 输入：T1.2.2.1，`createBaseEvent(hub, "error")` 已就绪
    - 输出：`error.ts` 主文件
    - 验收：SSR 环境静默降级；订阅级 try/catch 隔离；类型通过 `ErrorEventSchema.safeParse`
    - 依赖：T1.2.2.1
  - [x] **T1.2.2.3** 单测 `error.test.ts`：11 case 全绿（JS 冒泡 / `ignoreErrors` 字符串 / 正则 / Promise Error 带栈 / 非 Error rejection JSON 序列化 / img 404 / script 404 / link 404 / `captureResource=false` 跳过捕获阶段监听 / WeakSet 冒泡+捕获去重 / SSR 降级）— 0.3d（完成 2026-04-27，SDK 合计 55/55 绿）
    - 输入：T1.2.2.2
    - 输出：`error.test.ts`
    - 验收：全部绿；覆盖率 ≥ 85%
    - 依赖：T1.2.2.2
  - [x] **T1.2.2.4** 公开 API + UMD：`src/index.ts` 追加 `errorPlugin` 具名导出 + UMD 命名空间挂载（对齐 `performancePlugin`） — 0.1d（完成 2026-04-27）
    - 输入：T1.2.2.2
    - 输出：`dist/index.d.ts` 含 `errorPlugin`
    - 验收：`pnpm -F @g-heal-claw/sdk typecheck && build` 全绿
    - 依赖：T1.2.2.2
  - [x] **T1.2.2.5** 体积预算验证 + examples/nextjs-demo 接入：`ghc-provider.tsx` 注册 `errorPlugin()`；ESM 体积 6.38 → 7.50 KB gzip（+1.12 KB），仍在 8.5 KB 预算内 — 0.3d（完成 2026-04-27；浏览器手动冒烟合并到 T1.4.0.4 / T2.1.1.7 一起执行）
    - 输入：T1.2.2.4
    - 输出：demo 注册生效；体积数字记录到本任务
    - 验收：ESM gzip ≤ 8.5KB；浏览器手动点击 4 个 `/errors/*` demo 路由，DevTools Network 能看到 `/ingest/v1/events` 四次不同 `subType` 的上报
    - 依赖：T1.2.2.4

### M1.4 异常持久化切片（ADR-0016）

- [ ] **T1.4.0** 异常事件持久化切片（`error_events_raw` 单表，不入队、不指纹聚合）— 1.2d（依据 ADR-0016 §2；完整 ErrorProcessor 留给 T1.4.1/T1.4.2）
  - [x] **T1.4.0.1** `shared/database/schema.ts` 扩展（完成 2026-04-27，`errorEventsRaw` + 3 索引 + `ALL_DDL` 组合，server typecheck 绿） `errorEventsRaw` 表定义 + 3 个索引；`ddl.ts` 追加 `CREATE TABLE IF NOT EXISTS` — 0.3d
    - 输入：ADR-0016 §2 DDL
    - 输出：`schema.ts` 新增导出 + `ddl.ts` 常量
    - 验收：`DatabaseService.onModuleInit` 启动时幂等建表；再次启动不报错
    - 依赖：无
  - [x] **T1.4.0.2** `apps/server/src/errors/errors.module.ts` + `errors.service.ts`：`saveBatch(events: ErrorEvent[])` + `message_head = message.slice(0,128)` + `event_id UNIQUE` 幂等；`NODE_ENV=test` 短路返回 0 — 0.4d（完成 2026-04-27；ErrorsModule 已在 AppModule 注册）
    - 输入：T1.4.0.1
    - 输出：ErrorsModule 可注入
    - 验收：`AppModule` 注册；单元测试注入 DatabaseService mock 验证行映射
    - 依赖：T1.4.0.1
  - [x] **T1.4.0.3** GatewayService 扩展：过滤 `type='error'` 并调用 `errorsService.saveBatch`；日志补 `errors=N`；更新单测 `gateway.service.spec.ts` — 0.3d（完成 2026-04-27；`gateway.service.spec.ts` 3 用例重写：非持久化日志、纯 error、perf+error+custom 混合）
    - 输入：T1.4.0.2
    - 输出：`gateway.service.ts` + 单测
    - 验收：混合批次（perf+error+其他）正确分流；GatewayService 不引入新依赖外的模块
    - 依赖：T1.4.0.2
  - [ ] **T1.4.0.4** 端到端自测：本地 PG 已启动 → 启动 server → demo 触发 `/errors/sync` → `psql -c "SELECT sub_type, message_head FROM error_events_raw ORDER BY ts_ms DESC LIMIT 5"` 查到对应行 — 0.2d
    - 输入：T1.4.0.3
    - 输出：验证截图或 SQL 输出
    - 验收：4 个 demo 异常路由各至少 1 行入库；幂等校验（重放相同 payload 不新增行）
    - 依赖：T1.4.0.3

### M1.6 Dashboard 异常首版 API（ADR-0016）

- [ ] **T1.6.2.0** Dashboard 异常大盘 API 首版 + Web `/errors` 改造（直查 `error_events_raw`，`(sub_type, message_head)` 字面分组；完整 Issues CRUD 留给 T1.6.2 ~ T1.6.6）— 2.8d
  - [x] **T1.6.2.0.1** ErrorsService 聚合查询：`aggregateSummary` / `aggregateBySubType` / `aggregateTrend` / `aggregateTopGroups`（Drizzle + `sql` + `date_trunc` + `GROUP BY`）— 0.6d（完成 2026-04-27）
    - 输入：T1.4.0 已就绪
    - 输出：`errors.service.ts` 新增 4 个 aggregate 方法
    - 验收：返回类型对齐 ADR-0016 §3 DTO；全部走 `idx_err_*` 索引（`EXPLAIN` 确认）
    - 依赖：T1.4.0
  - [x] **T1.6.2.0.2** `apps/server/src/dashboard/errors.controller.ts` + `errors.service.ts`（装配层）+ `dto/errors-overview.dto.ts`（Zod query + response Schema + Swagger）— 0.5d（完成 2026-04-27）
    - 输入：T1.6.2.0.1
    - 输出：`GET /dashboard/v1/errors/overview` 端点可用
    - 验收：Swagger `/docs` 显示端点；query Zod 校验失败返回 400；空数据返回 5 subType 占位
    - 依赖：T1.6.2.0.1
  - [x] **T1.6.2.0.3** 服务端聚合单元测试：`errors.service.spec.ts` 5 case（空窗口 / 单 subType / 环比 up 25% / 环比 down 20% / topGroups ISO 转换 + 趋势宽表）— 0.3d（完成 2026-04-27，server 单元 8/8 + e2e 4/4 全绿）
    - 输入：T1.6.2.0.2
    - 输出：Vitest 单测
    - 验收：`pnpm -F @g-heal-claw/server test` 全绿
    - 依赖：T1.6.2.0.2
  - [x] **T1.6.2.0.4** `apps/web/lib/api/errors.ts`：`getErrorOverview()` + `emptyErrorOverview()` + 三态 `source: "live" | "empty" | "error"`（对齐 `performance.ts`）— 0.3d（完成 2026-04-27）
    - 输入：T1.6.2.0.2
    - 输出：Web 端 API 客户端 + 类型
    - 验收：`typecheck` 通过；5xx / 网络失败降级为 `error` 态
    - 依赖：T1.6.2.0.2
  - [x] **T1.6.2.0.5** 4 个 UI 组件：`summary-cards.tsx`（总事件/影响会话/环比 Badge）/ `sub-type-donut.tsx`（纯 CSS `conic-gradient` + 图例，不引图表库）/ `trend-chart.tsx`（复用 `@ant-design/plots` Line）/ `top-groups-table.tsx`（shadcn Table + subType Badge）— 0.7d（完成 2026-04-27）
    - 输入：T1.6.2.0.4
    - 输出：4 个客户端组件
    - 验收：每个组件对空数据 graceful 渲染（不 crash）
    - 依赖：T1.6.2.0.4
  - [x] **T1.6.2.0.6** `app/(dashboard)/errors/page.tsx` 装配 + `export const dynamic = "force-dynamic"` + 三态 Badge + `typecheck && build` 全绿（`/errors` 标记 ƒ Dynamic）— 0.4d（完成 2026-04-27；live/empty/error 浏览器冒烟合并到 T1.4.0.4 / T2.1.1.7 一起执行）
    - 输入：T1.6.2.0.5
    - 输出：`/errors` 完整 live 页面
    - 验收：触发 demo 异常后刷新 `/errors` 能看到样本；server 未运行时显示 `error` 态 Badge
    - 依赖：T1.6.2.0.5
  - [x] **T1.6.2.0.7** 异常模块 9 类目扩展切片（ADR-0019）：SDK `httpPlugin`（Ajax + API code）+ `errorPlugin` 资源细分（js_load/image_load/css_load/media）+ 白屏心跳；`ErrorEventSchema.category` 9 值；`error_events_raw` drizzle 迁移 `0002_errors_ajax_columns.sql`；`ErrorsService` 9 类目聚合；Web `/errors` 重构（删除 summary-cards / sub-type-donut / top-groups-table / trend-chart；新增 category-cards / dimension-tabs / ranking-table / stack-chart（DualAxes 堆叠柱 + 全部日志 rose-600 折线））；demo 新增 7 场景路由；`turbo` dev/build 顺序重排为 shared → sdk → server → web → demo；`apps/web/(dashboard)/layout.tsx` 用 Suspense 包裹 Topbar 修复 `useSearchParams()` CSR bailout — 1.2d（完成 2026-04-28；`pnpm typecheck` 7/7 + `pnpm build` 5/5 全绿；单测待 T1.6.2.0.8 在新 `tests/` 目录下补齐）
    - 输入：T1.6.2.0.6
    - 输出：9 类目采集 / 存储 / 聚合 / 展示全链路；7 个异常演示路由；turbo 严格串行链
    - 验收：typecheck + build 全绿；demo 触发 7 类场景可观测到对应 category 上报
    - 依赖：T1.6.2.0.6
  - [x] **T1.6.2.0.8** 在各包 `tests/` 目录补回核心路径单测（ADR-0019 强制放置规则）：`packages/shared/tests/events/error.test.ts`（9 subType + resource.kind 判别，8 case）+ `packages/sdk/tests/plugins/http.test.ts`（fetch 成功/api_code/非 2xx/抛错/ignoreUrls/self-ingest/双 patch + XHR 404/onerror，10 case）+ `packages/sdk/tests/plugins/error.test.ts`（JS/Promise/资源 4 分类/WeakSet 去重/ignoreErrors，9 case）+ `apps/server/tests/dashboard/errors.service.spec.ts`（9 类目 ratio / null 兜底 / delta up/down/flat / 空窗口 / topGroups，7 case）— 0.8d（完成 2026-04-28；同步修正 `packages/sdk/vitest.config.ts` include 改为 `tests/**`）
    - 输入：T1.6.2.0.7
    - 输出：shared 17 tests / sdk 19 tests / server 7 单元 + 4 e2e 全绿；`src/**/*.{test,spec}.{ts,tsx}` 保持零存在
    - 验收：`pnpm typecheck` 7/7 + `pnpm build` 5/5 + 分包 `pnpm test` 全绿
    - 依赖：T1.6.2.0.7
- [ ] **T1.2.3** Breadcrumb 收集（路由切换、点击、console、fetch/xhr 轨迹）— 2d
- [ ] **T1.2.4** 设备与页面上下文采集（ua-parser / viewport / network / page info）— 1d
- [ ] **T1.2.5** 上报传输层（beacon / fetch / image 自动协商 + 批量队列 + flushInterval）— 3d
- [ ] **T1.2.6** 失败重试 + IndexedDB 持久化兜底 — 2d
- [ ] **T1.2.7** 采样 + `beforeSend` + `ignoreErrors` + 敏感字段默认过滤 — 2d
- [ ] **T1.2.8** SDK 构建（Rollup + ESM/UMD + 类型声明 + 体积预算 < 15KB gzip）— 2d
- [ ] **T1.2.9** SDK 单测 + Playwright 真实浏览器集成测试 — 3d

### M1.3 Gateway 入口

- [ ] **T1.3.1** GatewayModule 骨架 + `/ingest/v1/events`、`/ingest/v1/beacon` 端点 — 2d
- [x] **T1.3.2** DSN 鉴权 Guard + 项目缓存 — 2d（完成 2026-04-28，commit `8a167d7`）
- [x] **T1.3.3** 项目级限流（Redis 令牌桶 Lua）— 2d（完成 2026-04-29；`RateLimitService` + `RateLimitGuard` + 9 单测全绿）
- [ ] **T1.3.4** 事件 Zod 校验 Pipe + 批量分发到各队列 — 2d
- [x] **T1.3.5** 幂等去重（eventId Redis SETNX）— 1d（完成 2026-04-29；`IdempotencyService` + `RedisService` + 8 单测全绿）
- [~] **T1.3.6** Gateway 压测基线（k6，目标 5000 events/s）— 2d（完成 2026-04-29：`apps/server/bench/ingest.k6.js` + README；压测数字待在目标硬件执行后粘回本条目）

### M1.4 ProcessorModule：异常消费

- [x] **T1.4.1** ErrorProcessor（Issue UPSERT + events_raw 写入，切片方案，未引入 BullMQ）— 3d（完成 2026-04-28，commit `35a029e`）
- [x] **T1.4.2** 指纹计算（normalize message + top-frame + sha1） — 2d（完成 2026-04-28，随 T1.4.1 交付）
- [x] **T1.4.3** Issue 用户数 HLL 估算 + 分钟级批量回写 — 2d（完成 2026-04-29；`IssueUserHllService` 写入路径 `PFADD` + `IssueHllBackfillService` cron 定时 `PFCOUNT` 回写 `issues.impacted_sessions`；ENV 开关 `ISSUE_HLL_BACKFILL_INTERVAL_MS`（0 禁用）；5+6 单测全绿）
- [x] **T1.4.4** DLQ 死信队列 + 失败告警 — 1d（完成 2026-04-29；`events_dlq` 表 + `DeadLetterService` + ErrorsService 双路径兜底 + 10 单测全绿）

### M1.5 Sourcemap 服务

- [ ] **T1.5.1** SourcemapModule HTTP（Release 创建 + multipart 上传 + 列表/删除）— 3d
- [ ] **T1.5.2** S3/MinIO 存储封装（StorageService） — 2d
- [ ] **T1.5.3** 堆栈还原 Service（source-map v0.7 + LRU 缓存 + 预热）— 3d
- [ ] **T1.5.4** ErrorProcessor 接入还原 Service — 1d
- [ ] **T1.5.5** `@g-heal-claw/cli` 上传工具（登录 / upload release / upload artifacts）— 3d
- [ ] **T1.5.6** `@g-heal-claw/vite-plugin` 构建期上传钩子 — 2d

### M1.6 Dashboard：异常模块

- [ ] **T1.6.1** DashboardModule 基础框架（统一响应、JWT、ProjectGuard、Swagger）— 2d
- [ ] **T1.6.2** Issues 列表 API（筛选：环境、状态、level、时间范围；排序：last_seen、count）— 2d
- [ ] **T1.6.3** Issue 详情 API（代表事件、堆栈、breadcrumbs、设备分布、趋势）— 2d
- [ ] **T1.6.4** web/errors 列表页 UI（表格 + 筛选 + 分页）— 3d
- [ ] **T1.6.5** web/errors 详情页 UI（堆栈高亮、breadcrumbs 时间轴、设备标签云）— 4d
- [ ] **T1.6.6** 异常状态机（open / resolved / ignored）+ 批量操作 — 2d

---

## 菜单完整化交付（ADR-0020，跨 Phase 主题）

**背景**：侧边栏 10 个菜单当前仅 `performance` / `errors` live，8 个仍为 PlaceholderPage。外部视角下产品形态长期不完整。
**决策**：以"菜单完整性"为本阶段主题，按依赖复杂度分三 Tier 推进。每完成 1 个 Tier 可独立上线。

### Tier 1.A｜API 监控（`/api` 菜单，~3d）

- [x] **TM.1.A.1** SDK `apiPlugin` 采集（独立于现有 `httpPlugin`，type='api' 包含成功请求；抽 `sdk/src/plugins/http-capture.ts` 公共捕获纯函数）— 0.8d（完成 2026-04-29）
  - 范围：fetch + XHR patch 复用，事件含 `method / url / status / duration / requestSize / responseSize / slow / failed / errorMessage`
  - 非范围：TraceID 注入（T2.2.3）、请求体截断采样（T2.2.2）
  - 交付：`packages/sdk/src/plugins/http-capture.ts`（共享纯函数）+ `api.ts`（新插件，独立 `__ghcApiPatched` 标记与 `httpPlugin` 并存）+ `tests/plugins/api.test.ts` 12 case；SDK 55/55 test 全绿；ESM 36.77KB / UMD 32.61KB gzip
- [x] **TM.1.A.2** `api_events_raw` 表 + drizzle 迁移 `0004_api_events_raw.sql`（沿用 raw 表统一设计：`(project_id, ts_ms)` 索引 + `event_id UNIQUE`；5 个索引）— 0.3d（完成 2026-04-29）
- [x] **TM.1.A.3** `apps/server/src/api-monitor/` 模块（`ApiMonitorModule` / `ApiMonitorService.saveBatch` + 4 聚合方法）+ GatewayService 分流（type='api' → apiMonitorService）— 0.8d（完成 2026-04-29）
  - 交付：`api-monitor.service.ts`（saveBatch 幂等 / aggregateSummary / aggregateStatusBuckets / aggregateTrend / aggregateSlowApis）+ `api-monitor.module.ts` + AppModule / GatewayModule / GatewayService 接线；`tests/api-monitor/api-monitor.service.spec.ts` 10 case 全绿
- [x] **TM.1.A.4** Dashboard API：`dashboard/api.controller` + `api.service` + Zod DTO（`/dashboard/v1/api/overview`：summary + 状态码桶 + 小时趋势 + Top 慢请求）— 0.4d（完成 2026-04-29）
  - 交付：`dashboard/dto/api-overview.dto.ts`（Zod query 契约 + 响应 DTO）+ `dashboard/api.service.ts`（两窗口聚合 + 环比）+ `dashboard/api.controller.ts`（Swagger 装饰 + ZodValidationPipe）+ DashboardModule 注册
- [x] **TM.1.A.5** Web `/api` 页面 live 化（替换 PlaceholderPage）— 0.5d（完成 2026-04-29）
  - 交付：`web/lib/api/api.ts`（契约 + getApiOverview + source 降级）+ 4 个页面组件（`summary-cards` / `status-buckets` / `trend-chart`（AntV Line 三折线）/ `top-slow-table`）+ 页面装配
- [x] **TM.1.A.6** 测试 + demo：`apiPlugin` 单测 12 case（TM.1.A.1 已交付）+ `api-monitor.service.spec.ts` 聚合单测 10 case + demo 注册 `apiPlugin`（slowThresholdMs=300）— 0.2d（完成 2026-04-29）

### Tier 1.B｜静态资源监控（`/resources` 菜单，~3d）

- [ ] **TM.1.B.1** SDK `resourcePlugin`：`PerformanceResourceTiming` observer + 分类（script/stylesheet/image/font/xhr/other）+ `slow / failed` 判定 — 0.8d
- [ ] **TM.1.B.2** `resource_events_raw` 表 + drizzle 迁移 — 0.3d
- [ ] **TM.1.B.3** `ResourceMonitorModule` + 聚合（按 `host + type` 聚合 + 失败率 + 慢资源 Top）— 0.7d
- [ ] **TM.1.B.4** Dashboard API + Web `/resources` 页面（CategoryCards = 类型分布 / DimensionTabs = host/cdn / RankingTable = failure_rate 倒序 / StackChart = 类型堆叠）— 0.9d
- [ ] **TM.1.B.5** 测试 + demo — 0.3d

### Tier 1.C｜自定义上报 + 日志（`/custom` + `/logs` 合并切片，~4d）

- [ ] **TM.1.C.1** SDK `trackPlugin` / `logPlugin`：公开 `track(name, props)` / `log(level, message)` API，映射到 `CustomEventSchema` / `CustomLogSchema` — 0.6d
- [ ] **TM.1.C.2** `custom_events_raw` + `custom_logs_raw` 双表 drizzle 迁移（本轮合并到 `0003_menu_raws.sql`）— 0.4d
- [ ] **TM.1.C.3** `CustomEventsModule` + `CustomLogsModule`（复用筛选框架，抽 `lib/dashboard-filter-form.tsx`）— 1d
- [ ] **TM.1.C.4** Dashboard API（事件流 / 指标趋势 / 日志筛选 by level + message like）+ Web `/custom` 页面（3 列：eventName / sampleCount / lastSeen，过度扩展推迟）+ Web `/logs` 页面（时序表 + level 筛选）— 1.5d
- [ ] **TM.1.C.5** 测试 + demo — 0.5d

> **Tier 1 整体验收**：4 张 raw 表通过单一迁移 `0003_menu_raws.sql` 一次性加入；4 个菜单从 Placeholder → live；server 单元 ≥ 130；`pnpm typecheck` 7/7 + `pnpm build` 5/5 保持。

### Tier 2｜访问/项目管理/实时通信（~17d，阻塞依赖先行）

- [ ] **TM.2.A** `visits` 页面（PageViewPlugin + IP 地域 + `page_view_raw` + 会话聚合）— 5d
  - 前置：GeoIP 库选型（MaxMind GeoLite2 许可证 + 运维 `GEOIP_DB_PATH`）
- [ ] **TM.2.B** `projects` 应用管理（项目 CRUD + API Token + RBAC）— 7d
  - **前置**：T1.1.7 JWT + RBAC 认证 MVP（4d）必须先行
- [ ] **TM.2.C** `realtime` 通信监控（WebSocket/SSE 采集）— 5d
  - **前置**：新 ADR（例如 ADR-0021）定协议范围 + 采集边界

### Tier 3｜总览收口（~2d）

- [ ] **TM.3.A** `overview` 数据总览：拼接前 9 个模块的汇总卡片 + 全站健康度 — 2d

### 范围与非范围

**纳入**：4 张 raw 表、4 个 SDK 插件、4 个 NestJS 模块、4 个前端页面 live 化、共享 filter/template 抽象
**推迟**：API TraceID 注入（T2.2.3）、`metric_minute` 预聚合（T2.1.4，Tier 2 之后）、`AutoTrackPlugin`（T3.3.1，Phase 3 末）、资源 CDN 测速细分（Phase 3 补齐）

---

## Phase 2：性能 + API + 访问

**目标**：Web Vitals、页面加载瀑布图、API 监控、PV/UV/会话看板。

### M2.1 性能监控

- [x] **T2.1.1** SDK PerformancePlugin（LCP/FCP/CLS/INP/TTFB + navigation 各阶段）— 4d（完成 2026-04-27，依据 ADR-0014；demo 冒烟 T2.1.1.7 按用户决定推迟）
  - [x] **T2.1.1.1** 依赖与骨架：`packages/sdk/package.json` 新增 `web-vitals@^4.2.4` 运行时依赖；新建 `src/plugins/performance.ts` 空骨架（导出 `performancePlugin()` 工厂 + `PerformancePluginOptions` 类型）— 0.3d（完成 2026-04-27）
    - 输入：ADR-0014
    - 输出：`package.json` 更新 + `src/plugins/performance.ts` 骨架
    - 验收：`pnpm install` 通过；`typecheck` 通过（Plugin 接口签名正确）
    - 依赖：无
  - [x] **T2.1.1.2** Navigation Timing 映射纯函数：`src/plugins/navigation-timing.ts` 实现 `mapNavigationTiming()`（字段映射 + ssl/redirect 条件置 undefined + type enum 防御映射 + `loadEventEnd<=0` 返回 null）— 0.5d（完成 2026-04-27）
    - 输入：T2.1.1.1
    - 输出：纯函数 + 类型
    - 验收：函数为纯函数（无副作用），返回值通过 `NavigationTimingSchema.safeParse`
    - 依赖：T2.1.1.1
  - [x] **T2.1.1.3** PerformancePlugin 核心：`src/plugins/performance.ts` 完整实现（SSR/PerformanceObserver 降级 + 5 Vitals 订阅 + Navigation 挂 TTFB + 订阅级 try/catch 隔离）— 1d（完成 2026-04-27）
    - 输入：T2.1.1.1, T2.1.1.2
    - 输出：完整 PerformancePlugin 实现
    - 验收：Plugin `setup` 不抛错；SSR 环境（无 `window`）静默降级
    - 依赖：T2.1.1.1, T2.1.1.2
  - [x] **T2.1.1.4** 单测：`performance.test.ts`（10 case：5 订阅 + value 负数夹 0 + 非白名单过滤 + navigation 时机 3 分支 + PerformanceObserver 降级）+ `navigation-timing.test.ts`（7 case：ssl/redirect 开关、loadEventEnd=0、type 防御、clock skew、prerender）— 共 16 新增，SDK 合计 35/35 全绿— 1d（完成 2026-04-27）
    - 输入：T2.1.1.3
    - 输出：≥ 12 个 test case 全绿
    - 验收：`pnpm -F @g-heal-claw/sdk test` 通过；新增测试覆盖率 ≥ 85%
    - 依赖：T2.1.1.3
  - [x] **T2.1.1.5** 公开 API + 导出：`src/index.ts` 追加 `performancePlugin` 具名导出 + UMD 命名空间挂载；`dist/index.d.ts` 含 `performancePlugin` 类型，UMD `cjs` 产物含符号— 0.2d（完成 2026-04-27）
    - 输入：T2.1.1.3
    - 输出：公开 API 对齐 ADR-0014 §5
    - 验收：`typecheck` 通过；`build` 产出 ESM/UMD + `dist/index.d.ts` 导出新符号
    - 依赖：T2.1.1.3
  - [x] **T2.1.1.6** 体积预算验证：`vite build` 产出 ESM 6.38KB gzip / UMD 5.58KB gzip，均在 15KB 总预算内（从骨架 2.73KB 增加到 6.38KB，web-vitals v4 + plugin 合计 +3.65KB）— 0.2d（完成 2026-04-27）
    - 输入：T2.1.1.5
    - 输出：体积数字记录
    - 验收：gzip ≤ 6KB；超预算则打开 `web-vitals` tree-shake 开关或降级为 B 备选（自研）
    - 依赖：T2.1.1.5
  - [ ] **T2.1.1.7** examples/nextjs-demo 接入（2026-04-27 解冻：与 T1.4.0.4 端到端冒烟合并执行；`ghc-provider.tsx` 已注册 `performancePlugin()` + `errorPlugin()`，仅剩浏览器真实上报观测）— 0.3d
    - 输入：T2.1.1.5
    - 输出：demo 可观测 Web Vitals 上报
    - 验收：浏览器 DevTools 看到至少 TTFB + FCP + Navigation 瀑布事件
    - 依赖：T2.1.1.5
  - [x] **T2.1.1.8** 端到端验证 + 文档闭环：`typecheck` / `test`（35/35） / `build`（ESM 6.38KB、UMD 5.58KB gzip）全绿；SPEC §4.2 契约无改动；CURRENT.md 同步完成— 0.2d（完成 2026-04-27）
    - 输入：T2.1.1.1 ~ T2.1.1.7
    - 输出：任务收尾 + 文档同步
    - 验收：所有子任务 `[x]`；CURRENT.md 记录体积数字
    - 依赖：T2.1.1.1 ~ T2.1.1.7
- [~] **T2.1.2** 首屏时间（MutationObserver + rAF 窗口）— 2d（作为 T2.1.8.P0.3 统一交付）
- [~] **T2.1.3** 长任务 / 卡顿 / 无响应采集 — 2d（≥50ms 采集已落地；3 级分级作为 T2.1.8.P0.2 统一交付）
- [ ] **T2.1.4** PerformanceProcessor（events_raw + metric_minute 聚合 p50/p95/p99）— 3d
- [ ] **T2.1.5** Apdex 计算 cron — 1d
- [x] **T2.1.6** 性能大盘 API 首版（依据 ADR-0015，直查 `perf_events_raw` + p75 聚合；Apdex/metric_minute 预聚合推迟到 T2.1.4/T2.1.5）— 2d（完成 2026-04-27）
  - [x] **T2.1.6.1** `apps/server/src/dashboard/` 骨架：`dashboard.module.ts` + `performance.controller.ts` + `performance.service.ts` + `dto/overview.dto.ts`（Zod query + response Schema）— 0.2d（完成 2026-04-27）
  - [x] **T2.1.6.2** 聚合 SQL：扩展 `PerformanceService` 新增 `aggregateVitals` / `aggregateTrend` / `aggregateWaterfallSamples` / `aggregateSlowPages`（Drizzle + `sql` 模板 + `percentile_cont`）— 0.6d（完成 2026-04-27）
  - [x] **T2.1.6.3** DashboardService 装配：并发 5 次查询（含环比）→ 映射 `ThresholdTone` / `DeltaDirection` → 返回 `PerformanceOverviewDto`；空数据返回 5 卡占位 `sampleCount=0`（不报错）— 0.3d（完成 2026-04-27）
  - [x] **T2.1.6.4** Controller + Swagger 注解 + `ZodValidationPipe(query)` + `AppModule` 注册 — 0.1d（完成 2026-04-27）
  - [x] **T2.1.6.5** `apps/web/lib/api/performance.ts` 改为真实 fetch + `emptyOverview()` 降级 + `source` 三态；`apps/web/.env.example` 新增 `NEXT_PUBLIC_DEFAULT_PROJECT_ID=proj_demo`；移除 `lib/fixtures/performance.ts` — 0.2d（完成 2026-04-27）
  - [x] **T2.1.6.6** `apps/web/app/(console)/monitor/performance/page.tsx`（ADR-0021 菜单重组后路由迁移自 `(dashboard)/performance/`）处理 live/empty/error 三态；`export const dynamic = "force-dynamic"` 避免 SSG 冻结 — 0.2d（完成 2026-04-27）
  - [x] **T2.1.6.7** 端到端验证：server typecheck/build/test（5/5 全绿）；web typecheck/build（`/performance` 标记 ƒ Dynamic）— 0.4d（完成 2026-04-27）
- [ ] **T2.1.7** web/performance 页面增强（环比切换 / 分页面瀑布图 / ECharts 深度定制）— 5d
- [~] **T2.1.8** 性能模块完整性切片（ADR-0018；SDK 已落地 longTaskPlugin / speedIndexPlugin，本切片补齐 FSP + 长任务分级 + SI 趋势白名单 + 回归测试 + 面板润色）— 5d
  - **P0（指标矩阵完整性，阻断）**
    - [ ] **T2.1.8.P0.1** 核实 SI 后端聚合路径：`aggregateTrend` 白名单加入 `'SI'`；`aggregateVitals` 的 `metric IS NOT NULL` 通过 SI 样本回放验证 — 0.3d
    - [ ] **T2.1.8.P0.2** 长任务 3 级分级（原 T2.1.3）：SDK `longTaskPlugin` 按 duration 分类写 `lt_tier`；`aggregateLongTasks` 扩 `tiers: { longTask, jank, unresponsive }`；Web 由单卡分裂为 3 子卡或 3 色堆叠柱 — 1d
    - [ ] **T2.1.8.P0.3** FSP 插件（原 T2.1.2）：`packages/sdk/src/plugins/fsp.ts` 用 MutationObserver + rAF 窗口；dispatch `metric='FSP'`；`demo/ghc-provider.tsx` 注册；服务端 `stages.firstScreen` 切换至 FSP p75 — 1.5d
  - **P1（回归保障）**
    - [ ] **T2.1.8.P1.1** `long-task.test.ts` + `speed-index.test.ts` 补齐单测（覆盖三级分级、FP/FCP/LCP 缺失、settleMs 时序、pagehide 兜底） — 0.7d
    - [ ] **T2.1.8.P1.2** `performance.service.spec.ts` 覆盖 5 条聚合函数（pg-mem 或 Dockerized PG 二选一，ADR-0007 原则优先 Dockerized） — 0.7d
    - [ ] **T2.1.8.P1.3** Topbar 时间范围 → URL `?windowHours=` 双向绑定（`24|48|168`），`router.replace` 不触 SSR 重走 — 0.3d
  - **P2（体验润色）**
    - [ ] **T2.1.8.P2.1** `VitalConfig.deprecated` 渲染灰底 "Deprecated" Badge（FID / TTI） — 0.2d
    - [ ] **T2.1.8.P2.2** 瀑布阶段 tooltip 注入 p75 公式 + metric_minute 迁移锚点 feature-flag 注释 — 0.3d
  - **刻意排除**
    - Apdex cron（T2.1.5，依赖 Apdex T 项目级配置，等 T1.1.7 认证）
    - `perf_events_raw` 表扩列（deviceModel / region / network），Phase 2 后期
    - `metric_minute` 预聚合（T2.1.4，另起 ADR）

### M2.2 API 监控

- [ ] **T2.2.1** SDK ApiPlugin（劫持 fetch + XHR，采集 method/url/status/duration/size）— 3d
- [ ] **T2.2.2** 慢请求 & 错误请求扩展字段（请求参数 / 响应片段 + 4KB 截断）— 2d
- [ ] **T2.2.3** TraceID 注入（可配置 header 名）— 1d
- [ ] **T2.2.4** ApiProcessor（按 method+path 聚合；pathTemplate 提取，如 `/api/users/123` → `/api/users/:id`）— 3d
- [ ] **T2.2.5** API 大盘 API（总览 / 慢请求 Top / 错误 Top / 按域名/状态码分析）— 2d
- [ ] **T2.2.6** web/api 页面 — 4d

### M2.3 访问分析

- [ ] **T2.3.1** SDK PageViewPlugin（首次 + SPA 路由监听 + session 保活）— 2d
- [ ] **T2.3.2** VisitProcessor（PV/UV，会话聚合，IP 地域解析）— 3d
- [ ] **T2.3.3** IP 地域库加载与缓存（MaxMind / 纯真 db）— 1d
- [ ] **T2.3.4** 访问大盘 API（总览 / Top 页面 / 访问来源 / 地域分布 / 会话详情）— 2d
- [ ] **T2.3.5** web/visits 页面 + 会话详情路径还原 — 4d

---

## Phase 3：资源 + 自定义 + 埋点

**目标**：资源性能看板、自定义事件/指标/日志、代码/全/曝光埋点。

### M3.1 资源监控

- [ ] **T3.1.1** SDK ResourcePlugin（`PerformanceResourceTiming` 采集 + 类型分类）— 2d
- [ ] **T3.1.2** ResourceProcessor（按 host + type 聚合 + 失败率）— 2d
- [ ] **T3.1.3** 资源大盘 API + web/resources 页面（类型分布、CDN 测速、慢资源 Top）— 3d

### M3.2 自定义上报

- [ ] **T3.2.1** SDK `track` / `time` / `log` API — 1d
- [ ] **T3.2.2** 全局属性（`setUser` / `setTag` / `setContext`）— 1d
- [ ] **T3.2.3** 自定义事件/指标/日志 Processor — 2d
- [ ] **T3.2.4** 自定义查询 API + web/custom 页面（事件流 / 指标趋势 / 日志筛选）— 4d

### M3.3 埋点

- [ ] **T3.3.1** SDK AutoTrackPlugin（`data-track` 自动上报 click/submit）— 2d
- [ ] **T3.3.2** SDK ExposurePlugin（IntersectionObserver + 500ms 停留）— 2d
- [ ] **T3.3.3** 页面停留时长（visibilitychange 累计）— 1d
- [ ] **T3.3.4** 埋点事件命名规范校验工具（CLI 检查 data-track 命名）— 2d
- [-] **T3.3.5** 可视化埋点圈选（MVP 剔除，Phase 6 评审纳入）

---

## Phase 4：告警 + 通知

**目标**：告警规则配置、评估、多渠道通知。

### M4.1 告警引擎

- [ ] **T4.1.1** AlertModule + `alert_rules` / `alert_history` / `channels` Schema — 2d
- [ ] **T4.1.2** 告警评估 Worker（每分钟 cron 扫描规则）— 3d
- [ ] **T4.1.3** 规则 DSL 与查询抽象（错误率 / API 成功率 / Web Vital / Issue 计数 / 自定义指标）— 3d
- [ ] **T4.1.4** 静默期与状态机（firing → resolved）— 1d

### M4.2 通知渠道

- [ ] **T4.2.1** NotificationModule 骨架 + `notifications` 队列消费 — 2d
- [ ] **T4.2.2** 渠道实现：邮件（SMTP） / 钉钉机器人 / 企业微信机器人 / Slack Incoming Webhook / 自定义 Webhook — 3d
- [ ] **T4.2.3** 短信渠道（阿里云 / 腾讯云 Provider 抽象 + 模板 ID 配置）— 2d
- [ ] **T4.2.4** 告警模板渲染 + 变量占位 — 1d
- [ ] **T4.2.5** 项目初始化时下发的**预置告警规则模板**（错误率突增 / Web Vital 劣化 / API 成功率下降）— 1d
- [ ] **T4.2.6** web/alerts：规则 CRUD + 触发历史 + 渠道测试发送 — 5d

---

## Phase 5：AI 诊断 + 自愈

**目标**：Issue 一键自愈 → AI 诊断 → 自动生成 PR。

### M5.1 AI Agent 基础

- [ ] **T5.1.1** `apps/ai-agent` 初始化（LangChain + 消费 BullMQ `ai-diagnosis`）— 2d
- [ ] **T5.1.2** 模型封装（Claude Opus 4.7 主 / GPT-4.x 备 + prompt caching）— 3d
- [ ] **T5.1.3** Tool 集合：readIssue / resolveStack / readFile / grepRepo / writePatch / runSandbox / createPr — 5d
- [ ] **T5.1.4** ReAct 循环 + 步数/LOC 护栏 + trace 记录 — 3d

### M5.2 HealModule

- [ ] **T5.2.1** HealModule API（`/heal/issues/:id` / `/heal/:jobId` / `/heal/:jobId/pr`）— 2d
- [ ] **T5.2.2** `heal_jobs` Schema + 状态机（pending → diagnosing → patching → verifying → pr_created / failed）— 2d
- [ ] **T5.2.3** 仓库配置读取（`.ghealclaw.yml`）— 1d

### M5.3 沙箱与 Git 集成

- [ ] **T5.3.1** Docker 沙箱封装（只读 mount + 网络禁用 + 超时） — 3d
- [ ] **T5.3.2** Git 平台集成：GitHub App + GitLab PAT — 3d
- [ ] **T5.3.3** PR 内容模板（诊断 Markdown + 影响 Issue 链接 + 标签 + reviewer 规则）— 2d
- [ ] **T5.3.4** web/heal：任务中心（运行中 / 历史 / 详情 / 手动取消）— 4d

### M5.4 质量与验证

- [ ] **T5.4.1** Heal 数据集：采集 30 条真实异常 + 期望修复 → 作为回归用例 — 3d
- [ ] **T5.4.2** 自动化验证：每次 Agent 改动跑回归集 + 成功率阈值 — 2d
- [ ] **T5.4.3** 安全审计：Prompt 注入防护、Tool 白名单、diff 大小限制复核 — 2d

---

## Phase 6：看板完善 + 开放 API + 多端

**目标**：仪表盘打磨、开放 API、小程序 SDK。

### M6.1 总览仪表盘

- [ ] **T6.1.1** web/overview（核心指标卡 + Apdex + 错误率 + API 成功率 + 慢页面 Top）— 4d
- [ ] **T6.1.2** 实时大盘（SSE 订阅 + 秒级刷新）— 3d
- [ ] **T6.1.3** 多维下钻（页面路径 / 地域 / 设备 / 浏览器 / 网络类型）— 4d

### M6.2 开放 API

- [ ] **T6.2.1** OpenApiModule + API Token 鉴权 + 独立限流 — 2d
- [ ] **T6.2.2** 端点：`/open/v1/issues` / `/open/v1/metrics/query` — 2d
- [ ] **T6.2.3** `/open/v1/events/stream` SSE 实时推送（基础版）— 2d
- [ ] **T6.2.4** `/open/v1/export` 批量导出（CSV / JSONL，异步任务 + 下载链接）— 3d
- [ ] **T6.2.5** OpenAPI 文档站（Swagger UI + 示例代码）— 2d

### M6.3 小程序 SDK

- [ ] **T6.3.1** `packages/miniapp-sdk` 骨架（复用 shared Schema）— 2d
- [ ] **T6.3.2** 微信小程序适配（App.onError / App.onUnhandledRejection / wx.request 劫持）— 3d
- [ ] **T6.3.3** 支付宝小程序适配 — 2d
- [ ] **T6.3.4** 小程序端性能采集（startup / page lifecycle）— 2d
- [-] **T6.3.5** 移动端 Native SDK（推迟，MVP 走 Hybrid WebView + H5 SDK）

### M6.4 自举与可观测

- [ ] **T6.4.1** 自家 Web 接入自家 SDK（dogfooding）— 1d
- [ ] **T6.4.2** Prometheus `/metrics` + Grafana 仪表盘模板 — 2d
- [ ] **T6.4.3** OpenTelemetry Trace 接入（可开关）— 2d

---

## 跨 Phase 持续事项

- [ ] **TX.1** 文档：每个模块完成后更新 `SPEC.md` / `ARCHITECTURE.md` / `DESIGN.md` 对应章节
- [ ] **TX.2** 每双周压测 Gateway + Processor，记录基线
- [ ] **TX.3** SDK 体积预算 CI Gate（变更超 1KB 需审批）
- [ ] **TX.4** 灰度发布流程（自研功能开关服务或 GrowthBook 接入评估）
- [ ] **TX.5** `docs/decisions/` 补全关键决策 ADR-0001 ~ ADR-0008

---

## 依赖与风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 高吞吐 Gateway 单进程瓶颈 | 事件丢失 | Phase 1 末压测，不达 5k/s 先拆 Worker 进程，预留 Kafka 切换口 |
| AI 模型成本 | 运营成本超预期 | Prompt caching + 低优先级走 Haiku + heal 成功率阈值未达前不开放自动触发 |
| Sourcemap 体积大 | 存储成本 | 只保留最近 3 个 release，大于 50MB 单文件拒收 |
| 第三方通知接口波动 | 告警失效 | 通知任务独立 DLQ + 双渠道冗余（邮件 + 钉钉） |
| Heal PR 质量风险 | 线上事故 | 必须人工 review；路径白名单 + LOC 上限 + 沙箱验证三重保险 |

---

## 当前焦点（Now）

> 每周同步更新本节。

- 进行中：**TM.1.B Tier 1.B 静态资源监控**（待启动，~3d）
- 阶段主题切换：**菜单完整化**（ADR-0020）— 本阶段不再纵深挖单模块，先把 `/api` `/resources` `/custom` `/logs` 4 个 Tier 1 菜单推到 live；Tier 1.A 已完成，Tier 1.B / 1.C 待启动
- 下一步候选（本 Tier）：①TM.1.B.1 resourcePlugin（PerformanceResourceTiming observer + 6 类资源分类）②TM.1.B.2 resource_events_raw ③TM.1.B.3/4 ResourceMonitorModule + Dashboard/Web ④TM.1.C custom/logs 合并切片
- 并行候选（不阻塞菜单推进）：T1.4.4 DLQ 告警（已完 90%）；T2.1.8 P0.1 SI 后端核实（~0.3d 小切片）
- 最近完成（2026-04-29）：**Tier 1.A API 监控菜单 live 化（TM.1.A 全 6 子任务）** —— SDK `apiPlugin`（独立 `__ghcApiPatched` 标记与 `httpPlugin` 并存，共享 `http-capture.ts` 纯函数；12 case 单测）；`api_events_raw` 表 + drizzle 0004 迁移；`ApiMonitorService`（saveBatch + 4 聚合方法，10 case 单测）；`DashboardApiService` + `/dashboard/v1/api/overview`（summary + 5 状态码桶 + 小时趋势 + Top 慢请求 + 环比）；Web `/api` 页面 4 模块组件（summary-cards / status-buckets / trend-chart AntV 三折线 / top-slow-table）；demo `ghc-provider.tsx` 注册 `apiPlugin({ slowThresholdMs: 300 })`；全量 typecheck 7/7 + server 单元 15 files 123 tests + e2e 6 tests 全绿
- 最近完成（2026-04-29）：**ADR-0020 菜单完整化交付路线图注册** —— `docs/decisions/0020-menu-delivery-roadmap.md` 三 Tier 分层（Tier 1: api/resources/custom/logs ~10d；Tier 2: visits/projects/realtime ~17d；Tier 3: overview 2d）；关键设计决策：`apiPlugin`（type='api' 采集成功请求）与现有 `httpPlugin`（type='error' 异常分流）并存 + raw 表统一设计 + 前端页面模板化复用 `errors` 结构；`docs/decisions/README.md` 索引更新；`docs/tasks/CURRENT.md` 注入 TM.1.A ~ TM.3.A 子任务树
- 最近完成（2026-04-29）：**T1.3.6 Gateway k6 压测脚本 + T1.4.3 Issue HLL 用户数估算 + 回写 cron** —— `apps/server/bench/ingest.k6.js`（ramping-vus 0→100→0，阈值 p95<200ms / p99<500ms / 成功率>99%）+ README；`IssueUserHllService`（写入路径 PFADD 批内归并）+ `IssueHllBackfillService`（30 分钟窗口 PFCOUNT 回写，只增不减防回退）；server 单元 113/113 + e2e 6/6 + typecheck 7/7 + build 5/5 全绿
- 最近完成（2026-04-28）：**T1.6.2.0.8 `tests/` 目录核心路径单测补齐（ADR-0019 放置规则）** —— `packages/shared/tests/events/error.test.ts` 8 case（9 subType + resource.kind 判别 + ajax/api_code request 字段 + 向后兼容）；`packages/sdk/tests/plugins/http.test.ts` 10 case（fetch 成功/api_code/非 2xx/抛错/非 JSON/ignoreUrls/self-ingest/双 patch + XHR 404/onerror）；`packages/sdk/tests/plugins/error.test.ts` 9 case（JS/Promise Error+字符串/资源 4 分类/WeakSet 冒泡+捕获去重/ignoreErrors 子串）；`apps/server/tests/dashboard/errors.service.spec.ts` 7 case（9 类目 ratio / resource.kind=null|other 兜底 js_load / delta up+down+flat / 空窗口 9 占位 / topGroups.category 映射）；同步修正 `packages/sdk/vitest.config.ts` include 为 `tests/**`；shared 17/17 + sdk 19/19 + server 7 单元 + 4 e2e 全绿
- 最近完成（2026-04-28）：**T1.6.2.0.7 异常模块 9 类目扩展切片（ADR-0019）** —— SDK `httpPlugin`（Ajax + API code）+ `errorPlugin` 资源细分（js_load/image_load/css_load/media + 白屏心跳）；`ErrorEventSchema.category` 9 值；drizzle `0002_errors_ajax_columns.sql`；`ErrorsService` 9 类目聚合；Web `/errors` 重构为 category-cards / dimension-tabs / ranking-table / stack-chart（DualAxes 堆叠柱 + 全部日志 rose-600 折线）；demo 新增 7 异常演示路由（ajax-fail / api-code / css-load / image-load / js-load / media-load / white-screen）；`turbo` dev/build 顺序改为严格串行 shared→sdk→server→web→demo；清理 19 个散落 src/ 下的 `.test.ts|.spec.ts` 并强制放置于 `tests/`；`apps/web/(dashboard)/layout.tsx` Suspense 包裹 Topbar 修复 Next 16 `useSearchParams()` CSR bailout；`pnpm typecheck` 7/7 + `pnpm build` 5/5 全绿
- 最近完成（2026-04-28）：**性能模块端到端 review + ADR-0018 + 文档一致性** —— 识别 4 P0 + 3 P1 + 2 P2 差距；T2.1.8 里程碑注册；SPEC §3.3.2/§4.2/§5.4.0/§6.3 同步补齐（10 指标 Rating 表 + long_task 3 级 tier + `PerformanceOverviewDto` 新增 longTasks/fmpPages/dimensions + 维度分阶段落地表）；ARCHITECTURE §4.2.1 同步（SDK plugins 四元组 + Dashboard 多聚合并发）
- 最近完成（2026-04-28）：T1.1.5 Drizzle Schema 首版基线（ADR-0017，7 子任务 2.8d 全部落地）—— `packages/shared/id.ts` + 7 前缀常量 + 8 case 单测；apps/server devDeps 扩容（drizzle-kit@^0.30 + nanoid@^5）；Schema 拆分为 schema/ 子目录 7 文件（8 张主表 + 3 张事件流）；events_raw 分区父表 + 4 张周分区 DDL；`ALL_DDL` 30 条（FK 严格顺序）；`drizzle/0001_initial.sql` 迁移源手工维护；shared 33 tests + server 8 unit tests 全绿；SPEC §9 + ARCHITECTURE §8.1.1 同步
- 最近完成（2026-04-27）：异常监控闭环切片 T1.2.2 / T1.4.0.1~3 / T1.6.2.0.1~6（ADR-0016）：SDK `errorPlugin` 三路订阅 + 资源加载过滤（55/55 单测绿，ESM 7.50KB gzip）；`error_events_raw` 幂等入库；GatewayService 分流 perf/error/其他；`/dashboard/v1/errors/overview` 五类 subType 占位 + 环比 + Top 分组；Web `/errors` 三态 Badge + CSS conic-gradient 环形图 + AntV Line 趋势；web build 11 页全绿（`/errors` 标记 ƒ Dynamic）
- 最近完成（2026-04-27）：T2.1.6 Dashboard 性能大盘 API 首版（ADR-0015，DashboardModule 直查 `perf_events_raw` + p75 聚合；Web `/performance` 改为 live 数据，三态 Badge 区分 live/empty/error；fixture 移除；server test 5/5 全绿）
- 最近完成（2026-04-27）：T2.1.1 SDK PerformancePlugin（ADR-0014，web-vitals@^4 + 自采 Navigation 瀑布，35/35 单测全绿，SDK 体积 ESM 6.38KB / UMD 5.58KB gzip，demo 冒烟 T2.1.1.7 按用户决定推迟）
- 最近完成（2026-04-27）：T1.1.6 `apps/web` 初始化（ADR-0012，Next 16 + shadcn/ui new-york + Tailwind v4 OKLCH 主题 + 10 页路由骨架 + 页面性能页完整落地）
- 最近完成（2026-04-27）：T1.1.3 `apps/server` 初始化（ADR-0011，NestJS 10 + Fastify 4 + ZodValidationPipe，5 用例单测/e2e 全绿，端到端 demo → server `accepted=1` 打通）
- 最近完成（2026-04-27）：T1.2.1 SDK 骨架 + examples/nextjs-demo（ADR-0010，44 项单测全绿，SDK 体积 2.73KB gzip）
- 最近完成（2026-04-27）：T1.1.4 落地 ADR-0009，`packages/shared` 产出 Env/Queues/Events 三部分，25 项单测全绿
- 阻塞：无
- 最近文档审查（2026-04-27）：完成 SPEC/ARCHITECTURE/DESIGN/CURRENT 对 `docs/PRD.md` v2 的对齐；补全 Breadcrumb Schema、navigation 阶段、UTM、p90、Apdex T 可配置、预置告警规则、批量导出、短信渠道与可视化埋点范围决策
- 最近文档审查（2026-04-27 · 性能指标与页面加载计算方式）：
  - SPEC §3.3.2 补齐 Web Vitals 官方阈值表 + `web-vitals@^4` 采集路径 + Rating good/NI/poor 阈值（LCP/FCP/CLS/INP/TTFB）
  - SPEC §4.2.1 补齐 `NavigationTiming` 9 字段计算公式（含 `Math.max(0, ...)` 防御、ssl/redirect 可选语义、`back_forward` 下划线规范）
  - SPEC §5.4.0 新增 Dashboard 性能大盘首版 API 契约（`/dashboard/v1/performance/overview`：query / response / 空数据 / 索引命中 / 错误码 / 9 阶段瀑布 DTO）
  - SPEC §6.2 拆分"长期 metric_minute 预聚合"与"过渡期直查 p75"两节，明确迁移锚点
  - ARCHITECTURE §3.1 DashboardModule 描述更新；§4.2 拆分为"当前实现（ADR-0013/0014/0015）"与"目标实现（T2.1.4+）"两段；§5.3 图表库首版更正为 `@ant-design/plots`、时间统一 dayjs
  - DESIGN §2 图表选型行更新为 `@ant-design/plots` + ECharts 保留；新增 dayjs 行；§5.2 新增 5.2.2 过渡期直查 `perf_events_raw` + `percentile_cont` 的理由（p75 对齐 Google 标准、瀑布取中位数、整体指标与串行阶段分离）；§15 ADR 索引追加 0013/0014/0015
  - apps/web/README.md 新增"已落地"节，反映真实图表库、时间库、数据源与三态
