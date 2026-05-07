# 任务跟踪

> 最后更新: 2026-05-07（Phase 5 M5.1~M5.4 AI 自愈 Agent MVP 完成：deepagents ReAct + 6 Provider + BullMQ 双向队列 + HealModule CRUD + heal_jobs 表 + 5 核心 Tools + 仓库配置 + PR 模板 + 端到端联调全绿 538 tests；ADR-0036 采纳 + docs 双向追溯）

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
| 应用子目录 | `apps/server` 已初始化（ADR-0011）；`apps/web` 已初始化（ADR-0012，shadcn/ui + `(console)/` 4 分组菜单 + 性能 / 错误 / API / 资源 / 访问 / 埋点事件大盘 live）；`apps/ai-agent` MVP 完成（ADR-0036，deepagents ReAct + 6 Provider + BullMQ + 5 Tools） |
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
- [x] **T1.1.7** 认证与项目管理 MVP（ADR-0032：JWT + RBAC + 项目 CRUD + Token 管理）— 4d（2026-05-04 全部完成）
  - [x] **T1.1.7.1** AuthModule 骨架 + AuthService（注册/登录/刷新/登出）+ bcrypt + JWT 签发 + Refresh Token Redis 存储 — 1.2d（2026-05-04 完成：12 单测全绿，typecheck 通过）
    - 输入：`users` 表已建（ADR-0017）；`JWT_SECRET` / `REFRESH_TOKEN_SECRET` 已在 `ServerEnvSchema`；`RedisService` 已就绪
    - 输出：
      - `apps/server/src/modules/auth/auth.module.ts`（Module 注册）
      - `apps/server/src/modules/auth/auth.service.ts`（register / login / refresh / logout / hashPassword / comparePassword / signTokens / revokeRefreshToken）
      - `apps/server/src/modules/auth/auth.controller.ts`（`@Controller('api/v1/auth')` 5 端点：POST register / POST login / POST refresh / POST logout / GET me）
      - `apps/server/src/modules/auth/dto/register.dto.ts`（Zod：email + password + displayName?）
      - `apps/server/src/modules/auth/dto/login.dto.ts`（Zod：email + password）
      - `apps/server/src/modules/auth/dto/refresh.dto.ts`（Zod：refreshToken）
      - `apps/server/src/modules/auth/dto/auth-response.dto.ts`（Zod：accessToken + refreshToken + user）
      - `apps/server/package.json` 新增 `bcryptjs` + `@types/bcryptjs` + `jsonwebtoken` + `@types/jsonwebtoken`
      - `packages/shared/src/env/server.ts` 新增 `BCRYPT_ROUNDS`（默认 12）
      - `.env.example` 追加 `BCRYPT_ROUNDS=12`
    - 验收：`typecheck` 全绿；单测 ≥ 10 case（注册成功 / 邮箱重复 409 / 登录成功 / 密码错误 401 / refresh 成功 / refresh 过期 401 / refresh 轮换旧 token 失效 / logout 删除 / me 返回用户信息 / db=null 短路）
    - 依赖：无
  - [x] **T1.1.7.2** JwtAuthGuard + ProjectGuard + RolesGuard + @Roles() 装饰器 — 0.8d（2026-05-04 完成：17 Guard 单测全绿）
    - 输入：T1.1.7.1（AuthService JWT 签发逻辑可复用验证）
    - 输出：
      - `apps/server/src/modules/auth/jwt-auth.guard.ts`（Bearer token 解码 → `req.user: JwtAuthContext`；test env 短路）
      - `apps/server/src/modules/auth/project.guard.ts`（从 query/params/body 取 projectId → 查 `project_members` → `req.projectMember: { role }`；系统 admin 自动放行）
      - `apps/server/src/modules/auth/roles.guard.ts`（读 `@Roles()` 元数据 → 对比 `req.projectMember.role` 角色等级）
      - `apps/server/src/modules/auth/roles.decorator.ts`（`@Roles(...roles)` 自定义参数装饰器 + `ROLES_KEY` 元数据 key）
    - 验收：单测 ≥ 8 case（JwtAuthGuard 正常 / 无 header 401 / 过期 401 / 畸形 token 401；ProjectGuard 成员通过 / 非成员 403 / admin 放行；RolesGuard viewer 被 admin 最低要求拒绝 / owner 通过）
    - 依赖：T1.1.7.1
  - [x] **T1.1.7.3** ProjectsService + ProjectsController（项目 CRUD + 创建事务 4 表联写）— 0.8d（2026-05-04 完成：11 单测全绿）
    - 输入：T1.1.7.2（Guards 就绪）；`projects` / `project_keys` / `project_members` / `environments` 表已建
    - 输出：
      - `apps/server/src/modules/auth/projects.service.ts`（create / list / getById / update / softDelete；create 内事务：INSERT projects + project_members(owner) + project_keys(默认) + environments×3）
      - `apps/server/src/modules/auth/projects.controller.ts`（`@Controller('api/v1/projects')` 5 端点 + Guards + Swagger）
      - `apps/server/src/modules/auth/dto/create-project.dto.ts`（Zod：name + slug + platform?）
      - `apps/server/src/modules/auth/dto/update-project.dto.ts`（Zod：name? + slug? + platform? + retentionDays?）
    - 验收：单测 ≥ 7 case（创建项目 + 4 表联写验证 / slug 重复 409 / 列表仅返回自己的项目 / 详情 / 更新 / 软删除 / viewer 无权更新 403）
    - 依赖：T1.1.7.2
  - [x] **T1.1.7.4** MembersService + MembersController（成员邀请/列表/角色更新/移除）— 0.6d（2026-05-04 完成：9 单测全绿）
    - 输入：T1.1.7.3（ProjectsController 就绪）
    - 输出：
      - `apps/server/src/modules/auth/members.service.ts`（list / invite / updateRole / remove）
      - `apps/server/src/modules/auth/members.controller.ts`（`@Controller('api/v1/projects/:projectId/members')` 4 端点）
      - `apps/server/src/modules/auth/dto/invite-member.dto.ts`（Zod：email + role）
      - `apps/server/src/modules/auth/dto/update-member.dto.ts`（Zod：role）
    - 验收：单测 ≥ 6 case（列出成员 / 邀请成功 / 邀请不存在 email 400 / owner 不可被降级 / 不可移除自己 / viewer 无权邀请 403）
    - 依赖：T1.1.7.3
  - [x] **T1.1.7.5** TokensService + TokensController（API Token CRUD + secretKey 脱敏）— 0.4d（2026-05-04 完成：8 单测全绿）
    - 输入：T1.1.7.3（ProjectsController 就绪）
    - 输出：
      - `apps/server/src/modules/auth/tokens.service.ts`（list / create / update / remove；create 返回完整 secretKey，list 脱敏）
      - `apps/server/src/modules/auth/tokens.controller.ts`（`@Controller('api/v1/projects/:projectId/tokens')` 4 端点）
      - `apps/server/src/modules/auth/dto/create-token.dto.ts`（Zod：label?）
    - 验收：单测 ≥ 4 case（创建返回完整 key / 列表脱敏 / 更新 label+is_active / 删除）
    - 依赖：T1.1.7.3
  - [x] **T1.1.7.6** DashboardModule 全量接入 JwtAuthGuard + ProjectGuard — 0.4d（2026-05-04 完成：12 Controller + DashboardModule imports 更新，全测试绿）
    - 输入：T1.1.7.2（Guards 就绪）；DashboardModule 现有 11 个 Controller
    - 输出：
      - `dashboard.module.ts` providers 追加 JwtAuthGuard + ProjectGuard
      - 11 个 Dashboard Controller 添加 `@UseGuards(JwtAuthGuard, ProjectGuard)`
      - 现有 e2e 测试适配（注入 mock user token 或 Guard 短路）
    - 验收：`typecheck` 全绿；现有 e2e 仍通过（test env Guard 短路）；手动 curl `/dashboard/v1/errors/overview` 无 Bearer → 401
    - 依赖：T1.1.7.2
  - [x] **T1.1.7.7** 单测 + e2e 补齐 — 0.5d（2026-05-04 完成：58 auth 单测全绿，随 T1.1.7.1~T1.1.7.5 同步完成）
    - 输入：T1.1.7.1 ~ T1.1.7.6
    - 输出：
      - `tests/modules/auth/auth.service.spec.ts`（核心认证流程）
      - `tests/modules/auth/auth.controller.spec.ts`（HTTP 层端点）
      - `tests/modules/auth/projects.service.spec.ts`（CRUD + 事务）
      - `tests/modules/auth/guards.spec.ts`（三层 Guard 组合）
      - e2e 扩展：注册 → 登录 → 创建项目 → 查询 Dashboard（全链路）
    - 验收：`pnpm test` 新增 ≥ 30 case 全绿；覆盖认证全流程 + RBAC 拒绝路径
    - 依赖：T1.1.7.1 ~ T1.1.7.6
  - [x] **T1.1.7.8** 文档传导 + Demo + apps/docs — 0.3d（2026-05-04 完成：demo 脚本 + reference/auth.md + ADR-0032 采纳 + rspress sidebar）
    - 输入：T1.1.7.7
    - 输出：
      - **Demo**：`examples/nextjs-demo/scripts/auth-flow.sh`（curl 示例：注册 → 登录 → 创建项目 → 邀请成员 → 查询 Dashboard with Bearer）
      - **Docs**：`apps/docs/docs/reference/auth.md`（认证 API 5 端点 + 项目 API 5 端点 + 成员 4 端点 + Token 4 端点 + 鉴权流程 + 角色权限矩阵 + 错误码）
      - **项目文档传导**：
        - `docs/SPEC.md §5.3` 路由状态从规划 → 已实现
        - `docs/ARCHITECTURE.md §3.1` 新增 AuthModule 行
        - `docs/decisions/0032-auth-module-mvp.md` 状态 提议 → 采纳
        - `rspress.config.ts` 侧边栏 reference 追加 Auth API
        - `CURRENT.md` T1.1.7.1~8 `[x]` + 当前焦点更新
    - 验收：双向可追溯；`pnpm typecheck` 全绿
    - 依赖：T1.1.7.7
- [x] **T1.1.8** CI 流水线（Turbo + Lint + Test + Build）— 1d（2026-05-04 完成）
  - [x] **T1.1.8.1** 统一 ESLint flat config（eslint.config.js + React + TypeScript 规则）— 0.3d
    - 输入：apps/web lint 临时 skip，需统一
    - 输出：
      - `eslint.config.js`（ESLint 9 flat config）
      - 覆盖 packages/sdk、shared、cli + apps/server、web、ai-agent + examples/nextjs-demo
      - 所有 package.json `"lint": "eslint ."`
      - 根 `package.json` 添加 `"type": "module"`
    - 验收：`pnpm lint` 全部通过，无错误
    - 依赖：无
  - [x] **T1.1.8.2** 创建 GitHub Actions CI workflow（.github/workflows/ci.yml）— 0.2d
    - 输入：T1.1.8.1 lint 可用
    - 输出：
      - `.github/workflows/ci.yml`（3 并行 job：lint-and-typecheck / test / build）
      - PostgreSQL 16 + Redis 7 服务容器（test job）
      - pnpm cache 配置
    - 验收：workflow 文件语法正确，触发条件覆盖 main/dev 分支
    - 依赖：T1.1.8.1
  - [x] **T1.1.8.3** 配置 Turbo Remote Caching（turbo.json + CI 环境变量）— 0.2d
    - 输入：T1.1.8.2 CI workflow 就绪
    - 输出：
      - `turbo.json` 启用 `remoteCache: { signature: true }`
      - CI workflow 所有任务注入 `TURBO_TOKEN` / `TURBO_TEAM`
      - `docs/CI_SETUP.md` 配置文档
    - 验收：本地 `turbo link` 可用，CI 注入环境变量正确
    - 依赖：T1.1.8.2
  - [x] **T1.1.8.4** 本地验证 CI 流程（lint / typecheck / test / build 全通过）— 0.3d
    - 输入：T1.1.8.1~3
    - 输出：
      - `pnpm lint` 全绿
      - `pnpm typecheck` 全绿
      - `pnpm test` 全绿（370 测试用例）
      - `pnpm turbo build --concurrency=2` 全绿（避免 Next.js worker 冲突）
      - 修复 auth.service 测试（对齐 dev 环境 admin 默认角色）
    - 验收：本地执行 4 条命令无错误
    - 依赖：T1.1.8.1~3

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
- [x] **T1.2.2** ErrorPlugin（`window.onerror` + `unhandledrejection` + 静态资源错误）— 1.5d（完成 2026-04-27）
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

- [x] **T1.4.0** 异常事件持久化切片（`error_events_raw` 单表，不入队、不指纹聚合）— 1.2d（完成 2026-05-07）
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
  - [x] **T1.4.0.4** 端到端自测：本地 PG 已启动 → 启动 server → demo 触发 → 查 `error_events_raw` 入库 — 0.2d（完成 2026-05-07）
    - 输入：T1.4.0.3
    - 输出：`apps/server/scripts/verify-error-pipeline.sh`（自动化验证脚本：发事件 → 查库 → 幂等校验）
    - 验收：4 步验证全部 OK（accepted / persisted / fields correct / idempotent）
    - 依赖：T1.4.0.3

### M1.6 Dashboard 异常首版 API（ADR-0016）

- [x] **T1.6.2.0** Dashboard 异常大盘 API 首版 + Web `/errors` 改造（直查 `error_events_raw`，`(sub_type, message_head)` 字面分组；完整 Issues CRUD 留给 T1.6.2 ~ T1.6.6）— 2.8d（完成 2026-04-28）
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
- [x] **T1.2.3** Breadcrumb 自动采集（ADR-0034）— 2d（2026-05-06 完成：breadcrumbPlugin 5 category 全部实现）
  - [x] **T1.2.3.1** `breadcrumbPlugin` 骨架 + navigation 采集（history.pushState / popstate patch）— 0.4d（完成 2026-05-06）
    - 输入：Hub.addBreadcrumb 已就绪；Breadcrumb Schema 已在 shared
    - 输出：`packages/sdk/src/plugins/breadcrumb.ts`（navigation category）
    - 验收：SPA 路由切换时 scope.breadcrumbs 新增 navigation 条目
    - 依赖：无
  - [x] **T1.2.3.2** click 采集（document 冒泡 + selector 提取 + text 截断）— 0.3d（完成 2026-05-06）
    - 输入：T1.2.3.1
    - 输出：breadcrumb.ts 扩展 click category
    - 验收：点击按钮/链接后 breadcrumbs 新增 click 条目（含 selector + text ≤ 80 字符）
    - 依赖：T1.2.3.1
  - [x] **T1.2.3.3** console 采集（console.log/warn/error patch + args 截断）— 0.3d（完成 2026-05-06）
    - 输入：T1.2.3.1
    - 输出：breadcrumb.ts 扩展 console category
    - 验收：console.error('test') 后 breadcrumbs 新增 error 级 console 条目
    - 依赖：T1.2.3.1
  - [x] **T1.2.3.4** fetch/XHR 轨迹采集（response 后记录 method/url/status/duration）— 0.5d（完成 2026-05-06）
    - 输入：T1.2.3.1；与 httpPlugin/apiPlugin 互不冲突（breadcrumb 仅轨迹，不上报独立事件）
    - 输出：breadcrumb.ts 扩展 fetch + xhr category
    - 验收：fetch 请求完成后 breadcrumbs 新增 fetch 条目；XHR 同理
    - 依赖：T1.2.3.1
  - [x] **T1.2.3.5** 单测（5 category 各 2+ case + SSR 降级 + 环形缓冲溢出）— 0.5d（完成 2026-05-06，13 case）
    - 输入：T1.2.3.1~4
    - 输出：`packages/sdk/tests/plugins/breadcrumb.test.ts`
    - 验收：≥ 12 case 全绿
    - 依赖：T1.2.3.1~4
- [x] **T1.2.4** 设备与页面上下文采集（ua-parser / viewport / network / page info）— 1d（增强 2026-05-06：browserVersion + osVersion + Navigator.connection）
  - [x] **T1.2.4.1** `contextPlugin`（UA 轻量解析 + viewport + network + page 信息注入 BaseEvent）— 0.7d
    - 输入：`createBaseEvent` 已有 device/page 骨架字段
    - 输出：`packages/sdk/src/context.ts`（正则 UA 解析 browser/os/device + browserVersion + osVersion + `navigator.connection` + `screen` + `location`）
    - 验收：事件 payload 含 `device.browser` / `device.browserVersion` / `device.os` / `device.osVersion` / `device.deviceType` / `page.url` / `network.effectiveType`；SSR 降级；体积 +<0.5KB
    - 依赖：无
  - [x] **T1.2.4.2** 单测 + demo 注册 + 体积验证 — 0.3d
    - 输入：T1.2.4.1
    - 输出：`tests/plugins/context.test.ts`（≥6 case）+ demo `ghc-provider.tsx` 注册
    - 验收：SDK 全量 gzip 增幅 < 1KB
    - 依赖：T1.2.4.1
- [x] **T1.2.5** 上报传输层（ADR-0034：批量队列 + 多通道协商）— 3d（2026-05-06 完成：queue + sender + transport factory）
  - [x] **T1.2.5.1** `transport/queue.ts` 事件队列（内存 buffer + maxBatchSize + flushInterval + pagehide flush）— 0.8d（完成 2026-05-06）
  - [x] **T1.2.5.2** `transport/sender.ts` 多通道发送器（beacon → fetch → image 降级链 + 64KB 拆批）— 0.8d（完成 2026-05-06）
  - [x] **T1.2.5.3** `transport/index.ts` 工厂 + 替换旧 `fetch.ts` + demo 验证 — 0.6d（完成 2026-05-06）
  - [x] **T1.2.5.4** 单测（queue flush 时机 + sender 降级 + 拆批 + keepalive）— 0.8d（完成 2026-05-06，queue 7 case + sender 5 case）
- [x] **T1.2.6** 失败重试 + IndexedDB 持久化兜底（ADR-0034）— 2d（2026-05-06 完成：persistence.ts + retry on online/startup）
  - [x] **T1.2.6.1** `transport/persistence.ts` IndexedDB 封装（open/store/read/delete/trim）— 0.8d（完成 2026-05-06）
  - [x] **T1.2.6.2** 失败重试集成（sender 失败 → persistence.store + online/启动 retry）— 0.7d（完成 2026-05-06）
  - [x] **T1.2.6.3** 单测 + 体积预算验证 — 0.5d（完成 2026-05-06，SDK ESM 40.43KB gzip，CI 预算 45KB）
- [x] **T1.2.7** 采样 + `beforeSend` + `ignoreErrors` + 敏感字段默认过滤 — 2d（2026-05-06 完成：filter.ts 四层链 — 采样率+ignoreErrors+敏感字段+beforeSend）
- [x] **T1.2.8** SDK 构建（Vite Library Mode + ESM/UMD + 类型声明 + 体积预算 ≤ 45KB gzip）— 2d（完成 2026-05-06；ESM 40.43KB / UMD 35.71KB gzip）
- [ ] **T1.2.9** SDK 单测 + Playwright 真实浏览器集成测试 — 3d（推迟至联调阶段）

### M1.3 Gateway 入口

- [x] **T1.3.1** GatewayModule `/ingest/v1/beacon` 端点（sendBeacon text/plain 兼容）— 0.5d（完成 2026-05-07）
  - 输出：`gateway.controller.ts` beacon 端点 + `main.ts` text/plain parser + e2e 1 case
  - 验收：`pnpm test` 7 e2e + 370 unit 全绿
- [x] **T1.3.2** DSN 鉴权 Guard + 项目缓存 — 2d（完成 2026-04-28，commit `8a167d7`）
- [x] **T1.3.3** 项目级限流（Redis 令牌桶 Lua）— 2d（完成 2026-04-29；`RateLimitService` + `RateLimitGuard` + 9 单测全绿）
- [x] **T1.3.4** 事件 Zod 校验 Pipe + 批量分发到各队列 — 2d（已实现：ZodValidationPipe + IngestRequestSchema + 按 type 9 路分流 + error 类型 BullMQ 异步；其他类型同步直写待后续迁移）
- [x] **T1.3.5** 幂等去重（eventId Redis SETNX）— 1d（完成 2026-04-29；`IdempotencyService` + `RedisService` + 8 单测全绿）
- [~] **T1.3.6** Gateway 压测基线（k6，目标 5000 events/s）— 2d（完成 2026-04-29：`apps/server/bench/ingest.k6.js` + README；压测数字待在目标硬件执行后粘回本条目）

### M1.4 ProcessorModule：异常消费

- [x] **T1.4.1** ErrorProcessor（Issue UPSERT + events_raw 写入，切片方案，未引入 BullMQ）— 3d（完成 2026-04-28，commit `35a029e`）
- [x] **T1.4.2** 指纹计算（normalize message + top-frame + sha1） — 2d（完成 2026-04-28，随 T1.4.1 交付）
- [x] **T1.4.3** Issue 用户数 HLL 估算 + 分钟级批量回写 — 2d（完成 2026-04-29；`IssueUserHllService` 写入路径 `PFADD` + `IssueHllBackfillService` cron 定时 `PFCOUNT` 回写 `issues.impacted_sessions`；ENV 开关 `ISSUE_HLL_BACKFILL_INTERVAL_MS`（0 禁用）；5+6 单测全绿）
- [x] **T1.4.4** DLQ 死信队列 + 失败告警 — 1d（完成 2026-04-29；`events_dlq` 表 + `DeadLetterService` + ErrorsService 双路径兜底 + 10 单测全绿）

#### TM.E｜ErrorProcessor BullMQ 接管（ADR-0026，承接 T1.4.1 切片 → §4.1.2 目标形态）

> 背景：T1.4.1 / T1.4.2 已交付切片方案（同步直调 + 指纹聚合），但 `events-error` 队列仍为 🟡 过渡态、无 Sourcemap 服务端还原、`events_raw` 分区 2026-05-18 耗尽。本组任务落地 ADR-0026：Gateway 异步化 + Sourcemap stub（T1.5.3 填实现）+ 分区维护 cron。零 SDK / Web 契约变更。

- [x] **TM.E.1** BullMQ 依赖 + `EventsErrorQueue` 声明 + `ErrorProcessor` 骨架 — 0.6d · 2026-04-30
  - 输入：`packages/shared/src/queues/names.ts` `QueueName.EventsError` 已定义
  - 输出：`apps/server/package.json` 新增 `@nestjs/bullmq@^10` + `bullmq@^5`；`gateway/gateway.module.ts` 注册 `BullModule.registerQueue({ name: QueueName.EventsError })`；`modules/errors/error.processor.ts` 新建（`@Processor(QueueName.EventsError)` + `process(job)` 空壳 + Logger）；`errors.module.ts` 导出并注入
  - 验收：`pnpm -F @g-heal-claw/server typecheck && build` 全绿；启动日志出现 `[ErrorProcessor] listening queue=events-error`；队列向 Redis 连接建立
  - 依赖：无

- [x] **TM.E.2** Gateway `errors` 分流改为 enqueue + `ERROR_PROCESSOR_MODE` 灰度开关 + `enqueued` 响应字段 — 0.8d · 2026-04-30
  - 输入：TM.E.1
  - 输出：
    - `config/env.ts` / `ServerEnvSchema`（shared）新增 `ERROR_PROCESSOR_MODE: 'sync' | 'queue' | 'dual'`（默认 `queue`）
    - `gateway/gateway.service.ts`：`errorEvents.length > 0` 时按 mode 分流（queue → `this.errorQueue.add(...)`；sync → 保留 `this.errors.saveBatch`；dual → 两者同时）
    - `gateway/ingest.dto.ts` / 响应 Schema：追加 `enqueued: number`（accepted / persisted / duplicates 保留）
    - Redis 不可用 / `Queue.add` reject → 自动降级 sync 路径，WARN 日志
  - 验收：单测覆盖 3 模式；Swagger `/docs` 响应示例含 `enqueued`；e2e 混合批次（perf + error）两路径正确分流
  - 依赖：TM.E.1

- [x] **TM.E.3** `SourcemapModule` 骨架 + `SourcemapService.resolveFrames` stub — 0.4d · 2026-04-30
  - 输入：TM.E.1
  - 输出：`apps/server/src/modules/sourcemap/sourcemap.module.ts` + `sourcemap.service.ts`（`resolveFrames(event: ErrorEvent): Promise<ErrorEvent>` 直返 event，debug 日志含 `release / frames.length`）；`ErrorsModule` import `SourcemapModule`；Processor 持有 SourcemapService DI
  - 验收：单测覆盖 stub 幂等返回；`typecheck` / `build` 全绿；SourcemapService 可被未来 T1.5.3 直接替换实现体而不改 Processor
  - 依赖：TM.E.1

- [x] **TM.E.4** ErrorProcessor 消费循环 + `@OnQueueFailed` 桥接到 DLQ — 0.6d · 2026-04-30
  - 输入：TM.E.1, TM.E.2, TM.E.3
  - 输出：
    - `error.processor.ts` `process(job)`：`{ events: ErrorEvent[] }` → `Promise.all(events.map(ev => sourcemap.resolveFrames(ev)))` → `errors.saveBatch(resolved)` → 返回统计
    - `@OnQueueFailed`（attempts 耗尽）→ `dlq.enqueueEvents(events, 'error-processor-fail', reason)`
    - 默认 `attempts: 3, backoff: { type: 'exponential', delay: 2000 }`，`concurrency: 4`，`removeOnComplete: 1000`
  - 验收：单测 mock Queue + Worker 验证重试与 DLQ 转投；处理耗时日志含 `batch=N duration=Xms` 结构化字段
  - 依赖：TM.E.1, TM.E.2, TM.E.3

- [x] **TM.E.5** `@nestjs/schedule` + `PartitionMaintenanceService`（预建 N+2 水位）+ `ddl.ts` 扩 5 张分区 — 0.8d · 2026-04-30
  - 输入：ADR-0017 §3.8 现有 4 张分区
  - 输出：
    - `apps/server/package.json` 新增 `@nestjs/schedule@^4`；`app.module.ts` `ScheduleModule.forRoot()`
    - `apps/server/src/shared/database/partition-maintenance.service.ts`：`@Cron('0 3 * * 1')` 周一 03:00 UTC + `onModuleInit` 立即 tick；扫描 `pg_catalog` 已有 `events_raw_*` 分区；若未来 2 周内任一周缺分区则 `CREATE TABLE IF NOT EXISTS ... PARTITION OF events_raw FOR VALUES FROM ... TO ...`
    - `ddl.ts` `EVENTS_RAW_DDL` 扩 5 张幂等分区：`2026w21 ~ 2026w25`（2026-05-18 ~ 2026-06-22）
    - ENV 新增 `PARTITION_MAINTENANCE_CRON`（默认 `0 3 * * 1`，空串禁用）
  - 验收：test 环境跳过；dev 启动日志 `[PartitionMaintenance] ensured weeks=[w21..w25]`；单测注入假 DB 验证缺分区补建 + 已存在不重建
  - 依赖：无

- [x] **TM.E.6** 单测 + e2e 补齐 — 0.8d · 2026-04-30
  - 输入：TM.E.1 ~ TM.E.5
  - 输出：
    - `tests/gateway/gateway.service.spec.ts`：扩 `ERROR_PROCESSOR_MODE` 三分支 + `enqueued` 字段断言
    - `tests/modules/errors/error.processor.spec.ts`：消费成功 / SourcemapService 透传 / 重试耗尽入 DLQ（3 case）
    - `tests/modules/sourcemap/sourcemap.service.spec.ts`：stub 幂等（1 case）
    - `tests/shared/database/partition-maintenance.service.spec.ts`：cron 补建 / 已存在跳过 / cron 失败 WARN（3 case）
    - e2e：`POST /ingest/v1/events`（含 error）→ 返回含 `enqueued > 0`；Worker 处理后 `error_events_raw` 有行
  - 验收：`pnpm test` 新增 ≥ 8 case 全绿；现有 testbase 全绿
  - 依赖：TM.E.1 ~ TM.E.5

- [x] **TM.E.7** 文档传导 + demo 注释 + apps/docs 页面 — 0.4d · 2026-04-30
  - 输入：TM.E.6
  - 输出：
    - `docs/ARCHITECTURE.md §3.4`：`events-error` 🟡 → 🟢；`§4.1.2` 由"目标实现"改为"当前实现"并注明 Sourcemap 为 stub
    - `docs/SPEC.md`：Ingest 响应 Schema 补 `enqueued` 字段
    - `docs/tasks/CURRENT.md`：TM.E.1~TM.E.7 标记 `[x]` + 日期；"当前焦点"更新
    - `.env.example`：追加 `ERROR_PROCESSOR_MODE` / `PARTITION_MAINTENANCE_CRON`
    - `apps/docs/docs/reference/error-processor.mdx`（新建）+ `apps/docs/docs/guide/ops/partition-maintenance.mdx`（新建）+ `_meta.json` 侧边栏同步
    - `examples/nextjs-demo/app/errors/README.md` 或页面注释追加"现走 BullMQ 异步消费，观察 `[ErrorProcessor]` 日志"
  - 验收：`docs/decisions/0026-*.md` 「后续」章节引用 demo 与 apps/docs 双向可追溯；`pnpm -F docs build`（若启用）通过
  - 依赖：TM.E.6

### M1.5 Sourcemap 服务（ADR-0031，T1.5.1~T1.5.4 首版；T1.5.5/T1.5.6 推迟）

- [x] **T1.5.1** `release_artifacts` 表 + Drizzle schema + 迁移 + S3StorageService — 1.2d ✅ 2026-05-04
  - 输入：`releases` 表已存在；`BaseEnvSchema` 已含 9 个 `MINIO_*` key；DESIGN §9.4 StorageService 接口
  - 输出：
    - `apps/server/src/shared/database/schema/release-artifacts.ts`（Drizzle pgTable：id/release_id/project_id/filename/map_filename/storage_key/file_size/created_at + UQ(release_id,filename) + IDX(project_id,release_id)）
    - `apps/server/src/shared/database/schema.ts` re-export
    - `apps/server/src/shared/database/ddl.ts` ALL_DDL 追加
    - `apps/server/drizzle/0009_release_artifacts.sql` 迁移
    - `apps/server/src/modules/sourcemap/storage.service.ts`：`S3StorageService implements StorageService`（put/get/delete/deletePrefix）+ `@aws-sdk/client-s3` 依赖 + onModuleInit 确保 bucket + NODE_ENV=test 跳过
    - `apps/server/tests/modules/sourcemap/storage.service.spec.ts`：3 case（put+get round-trip mock / delete no-throw / deletePrefix 批量）
  - 验收：`pnpm typecheck` 全绿；迁移 SQL 可执行；单测 3 case 通过
  - 依赖：无

- [x] **T1.5.2** ApiKeyGuard + SourcemapController（Release CRUD + Artifact multipart 上传） — 1.5d ✅ 2026-05-04
  - 输入：T1.5.1（storage + schema）；`project_keys` 表已存在
  - 输出：
    - `apps/server/src/modules/sourcemap/api-key.guard.ts`：`@Injectable() ApiKeyGuard implements CanActivate`（读 `X-Api-Key` header → 查 `project_keys WHERE secret_key = $1 AND is_active` → 注入 projectId 到 request）
    - `apps/server/src/modules/sourcemap/dto/create-release.dto.ts`：Zod `{ projectId, version, commitSha? }`
    - `apps/server/src/modules/sourcemap/dto/upload-artifact.dto.ts`：Zod `{ filename }` + Fastify multipart 处理
    - `apps/server/src/modules/sourcemap/dto/release-artifact.dto.ts`：响应 Schema
    - `apps/server/src/modules/sourcemap/sourcemap.controller.ts`：`@Controller('sourcemap/v1')` 4 端点（POST releases / POST releases/:id/artifacts / GET releases/:id/artifacts / DELETE releases/:id）+ `@UseGuards(ApiKeyGuard)` + `@ApiTags('sourcemap')` + multipart 解析（`@fastify/multipart`）
    - `apps/server/src/modules/sourcemap/sourcemap.module.ts` 扩展：imports StorageService + Controller + Guard
    - `apps/server/tests/modules/sourcemap/sourcemap.controller.spec.ts`：6 case（创建 release 幂等 / 上传 artifact → storage.put / 列表 / 删除级联 / 重复 filename 覆盖 / 无效 API key 401）
  - 验收：`typecheck` 全绿；单测 6 case 通过；Swagger `/api-docs` 可见 sourcemap tag
  - 依赖：T1.5.1

- [x] **T1.5.3** SourcemapService resolveFrames 真实实现（source-map v0.7 + LRU） — 1.5d ✅ 2026-05-04
  - 输入：T1.5.1（storage）+ T1.5.2（controller 验证上传链路可用）
  - 输出：
    - `apps/server/package.json` 新增 `source-map@^0.7` + `lru-cache@^10` 依赖
    - `packages/shared/src/env/server.ts` 新增 `SOURCEMAP_LRU_CAPACITY`（默认 100）
    - `apps/server/src/modules/sourcemap/sourcemap.service.ts` 重写 resolveFrames：
      - 按 `(projectId, release, filename)` 查 `release_artifacts` → `storage_key`
      - LRU cache（key = `projectId:release:filename`，value = `SourceMapConsumer`，dispose 调 `.destroy()`）
      - 逐 frame `originalPositionFor({ line, column })` → 替换 file/line/column/function
      - 任何环节失败 → 原样返回该 frame + warn 日志
    - `apps/server/tests/modules/sourcemap/sourcemap.service.spec.ts` 扩展：新增 8 case（正常还原 3 frame / release 不存在降级 / artifact 不存在降级 / storage get 失败降级 / consumer 解析失败降级 / LRU hit 不重复 get / 无 frames 事件跳过 / 无 release 事件跳过）+ 保留原 3 stub 契约测试
    - `.env.example` 追加 `SOURCEMAP_LRU_CAPACITY=100`
  - 验收：`typecheck` 全绿；11 case 全绿（3 旧 + 8 新）；resolveFrames 永不抛错（mock 各种失败场景）
  - 依赖：T1.5.1, T1.5.2

- [x] **T1.5.4** 端到端验证 + Demo 脚本 + 文档传导 — 0.8d ✅ 2026-05-04
  - 输入：T1.5.3
  - 输出：
    - **Demo**：`examples/nextjs-demo/scripts/upload-sourcemap.sh`（curl 示例：创建 release → 上传 .map → 触发 error → 观察还原堆栈）+ `demo-scenarios.ts` 在 errors 分组追加 "Sourcemap 还原验证" 入口
    - **Docs**：
      - `apps/docs/docs/sdk/sourcemap.md` 更新为实际 API（替换占位）
      - `apps/docs/docs/reference/sourcemap.md` 新增后端 API 参考（4 端点 + 鉴权 + 响应格式）
    - **项目文档传导**：
      - `docs/SPEC.md §9.1` releases 行更新 + §9.2 `release_artifacts` 从"规划"改为"已建表"
      - `docs/ARCHITECTURE.md §3.1` SourcemapModule 从"stub"改为"已实现"
      - `docs/decisions/0031-sourcemap-service.md` 状态 提议 → 采纳
      - `CURRENT.md` T1.5.1~4 `[x]` + 当前焦点更新
  - 验收：双向可追溯（ADR-0031 后续引用 demo + docs）；`pnpm typecheck` 全绿
  - 依赖：T1.5.3

- [ ] **T1.5.5** `@g-heal-claw/cli` 上传工具（登录 / upload release / upload artifacts）— 3d（推迟）
- [ ] **T1.5.6** `@g-heal-claw/vite-plugin` 构建期上传钩子 — 2d（推迟）

### M1.6 Dashboard：异常模块

- [x] **T1.6.1** DashboardModule 基础框架（统一响应、JWT、ProjectGuard、Swagger）— 2d（完成 2026-04-27）
- [x] **T1.6.2** Issues 列表 API（筛选：状态、subType；排序：last_seen、event_count；分页）— 2d（完成 2026-05-06）
- [x] **T1.6.3** Issue 详情 API（含近期事件样本、设备信息）— 2d（完成 2026-05-06）
- [x] **T1.6.4** web/errors/issues 列表页 UI（表格 + 状态筛选 + 分页）— 3d（完成 2026-05-06）
- [x] **T1.6.5** web/errors/issues 详情页 UI（概览卡片 + 堆栈 + 设备标签）— 4d（完成 2026-05-06）
- [x] **T1.6.6** 异常状态机（open / resolved / ignored）+ UI 操作按钮 — 2d（完成 2026-05-06）

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

### Tier 1.B｜静态资源监控（`/monitor/resources` 菜单，~3d，ADR-0022）

- [x] **TM.1.B.1** SDK `resourcePlugin` — 0.8d（完成 2026-04-29）
  - 交付：`packages/shared/src/events/resource.ts` 扩展（category/host/slow/failed/startTime/cache 等）+ `packages/sdk/src/plugins/resource.ts` + 导出；16 case 单测（分类 / 失败判定 / SSR 降级 / 幂等 / fetch-xhr-beacon 排除 / cache 推导）
- [x] **TM.1.B.2** `resource_events_raw` 表 + 迁移 — 0.3d（完成 2026-04-29）
  - 交付：`schema/resource-events-raw.ts` + `drizzle/0006_resource_events_raw.sql` + `ddl.ts` `RESOURCE_DDL` 块；5 枚索引到位
- [x] **TM.1.B.3** `ResourceMonitorModule` + `ResourceMonitorService` + GatewayService 分流 — 0.7d（完成 2026-04-29）
  - 交付：`resource-monitor/{module,service}.ts`（saveBatch 幂等 + 5 聚合方法）+ `GatewayService.isResource` 分流 + `app.module.ts` 注册；13 case 单测（db=null 短路 / Number 强转 / 6 类占位 / Date&ISO 归一 / failureRatio）
- [x] **TM.1.B.4** Dashboard API `GET /dashboard/v1/resources/overview` — 0.4d（完成 2026-04-29）
  - 交付：`dashboard/{resources.controller.ts,resources.service.ts,dto/resources-overview.dto.ts}` + `DashboardModule` 注册；6 case 装配层单测（summary delta 双维度 / 空窗口 6 占位 / round2/round4 透传）
- [x] **TM.1.B.5** Web `/monitor/resources` 页面 live 化 — 0.5d（完成 2026-04-29）
  - 交付：`apps/web/lib/api/resources.ts` 契约（三态 source） + 5 组件（summary-cards / category-buckets / trend-chart AntV 切换 / top-slow-table / failing-hosts-table） + `nav.ts` placeholder=null；`pnpm -F @g-heal-claw/web build` 23 页全绿，`/monitor/resources` 标记 ƒ Dynamic
- [x] **TM.1.B.6** Demo 场景 + 文档 — 0.3d（完成 2026-04-29）
  - 交付：`examples/nextjs-demo/app/ghc-provider.tsx` 注册 `resourcePlugin({ slowThresholdMs: 500 })` + 新增 `(demo)/resources/{slow-script,image-gallery}/page.tsx` 2 页 + `demo-scenarios.ts` `resources` 分组追加 2 条 RT 样本路由（保留既有 4xx 错误路由）+ `GETTING_STARTED.md §7.4` 资源监控接入示例 + 新建 `apps/docs/docs/sdk/resources.md`（SDK 端详解 + 三链路互斥表 + 6 类分类 + Demo 对照）+ `apps/docs/docs/guide/resources.md`（大盘使用说明 + 边界矩阵）+ `rspress.config.ts` `/sdk/` 与 `/guide/` 双侧边栏注册 + `docs/ARCHITECTURE.md §5.1 / §3.1 / §8.1.1 / BullMQ 队列清单` 四处同步 + ADR-0022「后续」章节引用已交付路径（双向可追溯）

### Tier 1.C｜自定义上报 + 日志（`/tracking/custom` + `/monitor/logs` 合并切片，~1.5d，ADR-0023）

> 覆盖 SDK 主动业务 API（`track / time / log / captureMessage`）、3 张独立 raw 表、2 个后端 Module、2 个 Dashboard 大盘、2 张菜单 live 化、Demo 3 页 + 完整文档。与 trackPlugin（被动 DOM 采集 `type='track'`）在 type 维度完全独立。

- [x] **TM.1.C.1** SDK `customPlugin` + Client API 统一暴露 — 0.25d（2026-04-29 完成）
  - 输入：`packages/shared/src/events/{custom-event,custom-metric,custom-log}.ts` 已定义；`sdk/src/client.ts` 现有 `captureMessage` 占位
  - 输出：`packages/sdk/src/plugins/custom.ts`（setup 幂等 + Hub.client 注入 `track/time/log`）+ `sdk/src/client.ts` 方法签名补齐 + `sdk/src/index.ts` 导出 `track / time / log / captureMessage` 公开 API + UMD 挂 `window.GHealClaw`；SSR 降级；`custom_log.data` >8KB 截断 + `__truncated: true`；单会话 `custom_log` 限额 200；`custom_metric.duration` finite + ≤24h 过滤；12 case 单测（3 API × 幂等 / SSR / 大小限制 / captureMessage→log 等价）
  - 验收：`pnpm --filter @g-heal-claw/sdk test` + `typecheck` 全绿；SDK 体积 +<1KB gzip
  - 依赖：无

- [x] **TM.1.C.2** 3 张独立 raw 表 + drizzle 迁移 — 0.2d（2026-04-29 完成）
  - 输入：ADR-0023 §3 DDL；参考 `schema/resource-events-raw.ts` 架构同构
  - 输出：`schema/custom-events-raw.ts` + `custom-metrics-raw.ts` + `custom-logs-raw.ts` + `drizzle/0007_custom_tables.sql` + `ddl.ts` `CUSTOM_DDL` 块；索引齐全（events/metrics 各 2 枚，logs 3 枚含 `message_head`）
  - 验收：`pnpm --filter @g-heal-claw/server typecheck` 全绿；SQL `IF NOT EXISTS` 幂等
  - 依赖：无

- [x] **TM.1.C.3** `CustomModule` + `LogsModule` + GatewayService 分流 — 0.35d（2026-04-29 完成）
  - 输入：TM.1.C.2 表就绪；参考 `resource-monitor/*`
  - 输出：`apps/server/src/custom/{custom.module,custom-events.service,custom-metrics.service}.ts` + `apps/server/src/logs/{logs.module,logs.service}.ts`；GatewayService 新增 3 分流（`isCustomEvent / isCustomMetric / isCustomLog`）；`app.module.ts` 注册两 Module；聚合方法：events(summary/topEvents/trend/topPages) · metrics(summary/topMetrics p50p75p95/trend) · logs(summary 双窗口 errorRatio delta / levelBuckets 3 固定 / trend 三折线 / topMessages by message_head / search 骨架）；每 Service ≥8 case 单测（saveBatch 幂等 / Number 强转 / 空窗口占位 / delta 正负平 / 分位数边界）
  - 验收：`pnpm --filter @g-heal-claw/server test` 全绿，server 单元新增 ≥24
  - 依赖：TM.1.C.2

- [x] **TM.1.C.4** Dashboard API `GET /dashboard/v1/custom/overview` + `GET /dashboard/v1/logs/overview` — 0.2d（2026-04-29 完成）
  - 输入：TM.1.C.3；参考 `dashboard/resources.{controller,service}.ts` 装配层模式
  - 输出：`dashboard/custom.{controller,service}.ts` + `dashboard/logs.{controller,service}.ts` + `dto/{custom-overview,logs-overview}.dto.ts`（Zod）+ `DashboardModule` 注册；三态 source；装配层并行 Promise.all；`DashboardLogsService.computeRatioDelta` 复用 resources 同名函数思路；≥10 case 装配层单测
  - 验收：`ZodValidationPipe` 校验通过；`pnpm --filter @g-heal-claw/server build` 全绿
  - 依赖：TM.1.C.3

- [x] **TM.1.C.5** Web `/tracking/custom` + `/monitor/logs` 页面 live 化 — 0.3d（2026-04-29 完成）
  - 输入：TM.1.C.4；参考 `apps/web/app/(console)/monitor/resources/*` 完整模板
  - 输出：
    - `apps/web/lib/api/{custom,logs}.ts` 契约（三态 source + `empty*Overview()` fallback）
    - `app/(console)/tracking/custom/{page,summary-cards,events-trend-chart,top-events-table,top-metrics-table}.tsx`（events + metrics 双 Summary + AntV 切换趋势）
    - `app/(console)/monitor/logs/{page,summary-cards,level-buckets,trend-chart,top-messages-table}.tsx`（3 级别固定桶 + 三折线 + message Top）
    - `lib/nav.ts` 两菜单 `placeholder: null`
  - 验收：`pnpm --filter @g-heal-claw/web build` 全绿，两路由 `ƒ Dynamic`
  - 依赖：TM.1.C.4

- [x] **TM.1.C.6** Demo + 文档 — 0.2d（2026-04-29 完成）
  - 输入：TM.1.C.5；ADR-0023 §7~§8
  - 输出：
    - `examples/nextjs-demo/app/(demo)/custom/{track,time,log}/page.tsx` 3 页；`ghc-provider.tsx` 注册 `customPlugin()`
    - `demo-scenarios.ts` `tracking` 分组追加 "Track/Time/Log" 3 条；若 UX 合适拆 `logs` 子组
    - `GETTING_STARTED.md §7.5` 接入示例（3 API + 与 trackPlugin 区别 + SSR 降级 + 大小限制）
    - `apps/docs/docs/sdk/custom.md`（SDK 端详解 + 与 trackPlugin 对照表 + Demo 链接）
    - `apps/docs/docs/guide/custom.md`（`/tracking/custom` 大盘使用说明）
    - `apps/docs/docs/guide/logs.md`（`/monitor/logs` 大盘使用说明）
    - `rspress.config.ts` `/sdk/` + `/guide/` 双栏注册 3 条
    - `docs/ARCHITECTURE.md §3.1` 加 2 Module；§5.1 两路由 ✅；§8.1.1 事件流表 6 → 9 张
    - ADR-0023「后续」章节标注已交付路径（双向可追溯）
  - 验收：`pnpm typecheck` 全 8 包 + `pnpm --filter @g-heal-claw/docs build` 全绿
  - 依赖：TM.1.C.5

> **Tier 1 整体验收**：4 张菜单（api / resources / custom / logs）从 Placeholder → live；server 单元覆盖新增聚合全部 pass；`pnpm typecheck` 8/8 + `pnpm build` 全绿；ADR-0020 §2 Tier 1 全部闭环。

### TM.R｜apps/server 目录按入口边界重构（ADR-0025，~1d，零行为变更）

- [x] **TM.R.1** 业务域模块下沉 `modules/` 子目录 — 0.3d（2026-04-30 完成）
  - 输入：现状 `apps/server/src/{errors,performance,tracking,custom,logs}`（5 个无后缀业务域）
  - 输出：`apps/server/src/modules/{errors,performance,tracking,custom,logs}`；`apps/server/tests/{...}` 镜像迁移为 `apps/server/tests/modules/{...}`；5 处 `git mv`；`app.module.ts` / `gateway.module.ts` / `dashboard/*.module.ts` 的 import 路径更新
  - 验收：`pnpm -F @g-heal-claw/server typecheck + build + test` 全绿；e2e 全绿；HTTP 路由字符串零 diff（`grep @Controller` 前后对照）
  - 依赖：无

- [x] **TM.R.2** `api-monitor` → `modules/api` + `resource-monitor` → `modules/resources` 统一命名 — 0.3d（2026-04-30 完成）
  - 输入：TM.R.1 完成；`src/api-monitor/*` + `src/resource-monitor/*` + 对应 tests
  - 输出：
    - 目录：`modules/api/` + `modules/resources/`（`git mv`）
    - 文件名：`api-monitor.module.ts` → `api.module.ts`、`api-monitor.service.ts` → `api.service.ts`；`resource-monitor.*` 同理
    - TS 类名：`ApiMonitorModule/Service` → `ApiModule/ApiService`；`ResourceMonitorModule/Service` → `ResourcesModule/ResourcesService`
    - import / 注入处全部同步
  - 验收：typecheck + build + test 全绿；HTTP 路由字符串零 diff；队列名 / DB 表名 / Controller path 字符串完全不变
  - 依赖：TM.R.1

- [x] **TM.R.3** `dashboard/` 按 web 4 组菜单分级 — 0.3d（2026-04-30 完成）
  - 输入：TM.R.2 完成；`dashboard/{api,custom,errors,exposure,logs,performance,resources,tracking}.{controller,service}.ts`（16 平铺文件）
  - 输出：
    - `dashboard/monitor/` ← `{errors,performance,api,resources,logs}.{controller,service}.ts`（5×2=10 文件）
    - `dashboard/tracking/` ← `{tracking,exposure,custom}.{controller,service}.ts`（3×2=6 文件）
    - `dashboard/settings/.gitkeep`（占位，Tier 2+ 落地）
    - `dashboard/dto/` 保留不动
    - `dashboard.module.ts` import 路径同步（controllers/providers 列表字符串不变）
  - 验收：typecheck + build + test + e2e 全绿；`/dashboard/v1/**` 所有路径字符串零 diff；`pnpm test` 所有测试路径同步迁移至 `tests/dashboard/{monitor,tracking}/`
  - 依赖：TM.R.2

- [x] **TM.R.4** 文档传导 —  0.1d（2026-04-30 完成）
  - 输入：TM.R.3 完成
  - 输出：
    - `docs/ARCHITECTURE.md §3.1` 模块拓扑目录树更新 + 补"入口层 / 业务域层"分层说明
    - `docs/tasks/CURRENT.md`：TM.R.1~4 标记 `[x]` + 完成日期；更新"当前焦点（Now）"与"最近更新"时间戳
    - ADR-0025「后续」章节更新（无需 demo/docs 页面联动，因零行为变更）
  - 验收：`docs/` 内引用 `api-monitor`/`resource-monitor`/`ApiMonitorService`/`ResourceMonitorService` 全部已更新（或明确保留历史记录的语境）
  - 依赖：TM.R.3

> **TM.R 整体验收**：零行为变更——HTTP 路由清单 / 队列名 / DB 表名 / SDK 契约 / web fetch URL 字符完全不变；`pnpm typecheck 7/7 + build 5/5 + test all green + e2e all green`；`git mv` 历史可溯；实现 ADR-0025 §2 所述前后端目录心智对称。

### Tier 2｜访问/项目管理/实时通信（~17d，阻塞依赖先行）

- [x] **TM.2.A** `visits` 页面（简化切片：PageViewPlugin + `page_view_raw` + PV/UV/SPA占比/刷新占比/TopPages/TopReferrers；GeoIP / page_duration / session 聚合推迟）— ~2.5d（完成 2026-04-30，ADR-0020 Tier 2.A）
  - [x] **TM.2.A.1** SDK `pageViewPlugin`（硬刷新 + history patch；默认 `autoSpa: true`）— 0.4d（完成 2026-04-30）
  - [x] **TM.2.A.2** `page_view_raw` drizzle schema + DDL + migration 0008 — 0.3d（完成 2026-04-30）
  - [x] **TM.2.A.3** `VisitsModule.VisitsService`（saveBatch + aggregateSummary / aggregateTrend / aggregateTopPages / aggregateTopReferrers）— 0.5d（完成 2026-04-30）
  - [x] **TM.2.A.4** Gateway 分流接入（`isPageView` + `saveBatch` 计数进持久化汇总）— 0.1d（完成 2026-04-30）
  - [x] **TM.2.A.5** Dashboard `GET /dashboard/v1/visits/overview`（DashboardVisitsController + Service + Zod DTO；summary 环比/trend/topPages/topReferrers）— 0.4d（完成 2026-04-30）
  - [x] **TM.2.A.6** Web `/monitor/visits` live 页面（SummaryCards + TrendChart + TopPages + TopReferrers + 三态 SourceBadge）— 0.5d（完成 2026-04-30）
  - [x] **TM.2.A.7** Demo 场景 `/visits/page-view` + SDK/Server 单测 + docs 传导 — 0.3d（完成 2026-04-30）
  - 推迟：GeoIP 地域分布、page_duration 停留时长、session_raw 会话聚合、UTM 渠道归因（后续单独拆任务）
- [x] **TM.2.B** Settings 管理页面 Web UI（ADR-0033：projects / members / tokens / sourcemaps 4 页 CRUD）— ~4d（2026-05-06 完成）
  - **前置**：T1.1.7 ✅ + M1.5 ✅（后端全部就绪）
  - [x] **TM.2.B.1** UI 原语补齐 + API 客户端基础设施 — 0.4d（2026-05-06 完成：dialog + select + confirm-dialog + 4 API 客户端，typecheck 全绿）
    - 输入：shadcn/ui 已有 button/card/badge/table/tabs/input/label/skeleton；`lib/api/server-fetch.ts` 已就绪
    - 输出：
      - `apps/web/components/ui/dialog.tsx`（shadcn/ui Dialog）
      - `apps/web/components/ui/select.tsx`（shadcn/ui Select）
      - `apps/web/components/settings/confirm-dialog.tsx`（通用确认弹窗：title + description + onConfirm + destructive variant）
      - `apps/web/lib/api/projects.ts`（`listProjects / createProject / updateProject / deleteProject` + 三态 source）
      - `apps/web/lib/api/members.ts`（`listMembers / inviteMember / updateMemberRole / removeMember`）
      - `apps/web/lib/api/tokens.ts`（`listTokens / createToken / deleteToken`）
      - `apps/web/lib/api/sourcemaps.ts`（`listReleases / listArtifacts / deleteRelease`）
    - 验收：`pnpm -F @g-heal-claw/web typecheck` 全绿；4 个 API 客户端导出类型完整
    - 依赖：无
  - [x] **TM.2.B.2** 后端 Sourcemap Dashboard 代理端点 — 0.4d（2026-05-06 完成：DashboardSourcemapController 3 端点 + DashboardSourcemapService + SourcemapModule export STORAGE_SERVICE；370+6 测试全绿）
    - 输入：`releases` / `release_artifacts` 表已建；`dashboard/settings/.gitkeep` 占位已存在
    - 输出：
      - `apps/server/src/dashboard/settings/sourcemap.controller.ts`（`@Controller('dashboard/v1/settings/sourcemaps')` + `@UseGuards(JwtAuthGuard, ProjectGuard)` + 3 端点：GET releases / GET releases/:id/artifacts / DELETE releases/:id）
      - `apps/server/src/dashboard/settings/sourcemap.service.ts`（薄代理：listReleases / listArtifacts / deleteRelease — 直查 DB，删除时级联清理 MinIO）
      - `dashboard.module.ts` 注册 Controller + Service
      - `apps/server/tests/dashboard/settings/sourcemap.controller.spec.ts`（4 case：列表 / artifacts / 删除级联 / 无权 403）
    - 验收：`pnpm -F @g-heal-claw/server typecheck && test` 全绿；Swagger `/api-docs` 可见 3 端点
    - 依赖：无
  - [x] **TM.2.B.3** `/settings/projects` 应用管理页面 — 0.8d（2026-05-06 完成）
    - 输入：TM.2.B.1 API 客户端就绪
    - 输出：
      - `apps/web/components/settings/project-card.tsx`（项目卡片：name + slug + platform + 创建时间 + 操作按钮）
      - `apps/web/components/settings/create-project-dialog.tsx`（表单：name + slug + platform 下拉）
      - `apps/web/components/settings/edit-project-dialog.tsx`（表单：name + slug + platform + retentionDays）
      - `apps/web/app/(console)/settings/projects/page.tsx`（Server Component 首屏 fetch + Client 交互组件）
    - 验收：`typecheck && build` 全绿；创建/编辑/删除流程可交互；空项目态展示引导
    - 依赖：TM.2.B.1
  - [x] **TM.2.B.4** `/settings/members` 成员权限页面 — 0.7d（2026-05-06 完成）
    - 输入：TM.2.B.1 + TM.2.B.3（需要 projectId 来源）
    - 输出：
      - `apps/web/components/settings/member-table.tsx`（成员表格：email + displayName + role Badge + 操作列）
      - `apps/web/components/settings/invite-member-dialog.tsx`（表单：email + role 下拉）
      - `apps/web/components/settings/role-select.tsx`（角色选择下拉：owner/admin/member/viewer + 权限说明）
      - `apps/web/app/(console)/settings/members/page.tsx`（含 projectId 读取 + 空态引导）
    - 验收：`typecheck && build` 全绿；邀请/改角色/移除流程可交互；owner 不可被降级（UI 层灰显）
    - 依赖：TM.2.B.1, TM.2.B.3
  - [x] **TM.2.B.5** `/settings/tokens` API Keys 页面 — 0.5d（2026-05-06 完成）
    - 输入：TM.2.B.1
    - 输出：
      - `apps/web/components/settings/token-table.tsx`（Token 表格：label + 脱敏 key + 创建时间 + 操作）
      - `apps/web/components/settings/create-token-dialog.tsx`（表单：label 可选 + 创建后一次性展示完整 secretKey + 复制按钮）
      - `apps/web/app/(console)/settings/tokens/page.tsx`
    - 验收：`typecheck && build` 全绿；创建后 secretKey 仅展示一次（关闭后不可再查看）；删除确认
    - 依赖：TM.2.B.1
  - [x] **TM.2.B.6** `/settings/sourcemaps` Source Map 管理页面 — 0.5d（2026-05-06 完成）
    - 输入：TM.2.B.1 + TM.2.B.2（代理端点就绪）
    - 输出：
      - `apps/web/components/settings/release-list.tsx`（Release 列表：version + commitSha + artifact 数量 + 创建时间 + 删除按钮）
      - `apps/web/components/settings/artifact-table.tsx`（展开式 Artifact 表格：filename + fileSize + 上传时间）
      - `apps/web/app/(console)/settings/sourcemaps/page.tsx`
    - 验收：`typecheck && build` 全绿；展开 Release 可查看 Artifacts；删除 Release 级联确认
    - 依赖：TM.2.B.1, TM.2.B.2
  - [x] **TM.2.B.7** nav.ts 清空 + 收尾验证 + 文档传导 — 0.3d（2026-05-06 完成）
    - 输入：TM.2.B.3 ~ TM.2.B.6 全部完成
    - 输出：
      - `lib/nav.ts`：4 个 settings 菜单 `placeholder` → `null`
      - `pnpm typecheck` 全绿 + `pnpm build` 全绿
      - `apps/docs/docs/guide/dashboard/settings.md`（4 页使用说明）
      - `rspress.config.ts` 侧边栏注册
      - `docs/SPEC.md §5.3` 追加 3 个 sourcemap dashboard 端点
      - `docs/ARCHITECTURE.md §3.1` DashboardModule settings 子目录标记已实现
      - `docs/decisions/0033-settings-web-ui.md` 状态 提议 → 采纳 + 「后续」引用 demo + docs
      - `docs/tasks/CURRENT.md` TM.2.B.1~7 `[x]` + 当前焦点更新
    - 验收：双向可追溯；4 个 settings 菜单均 live
    - 依赖：TM.2.B.3 ~ TM.2.B.6
- [ ] **TM.2.C** `realtime` 通信监控（WebSocket/SSE 采集）— 5d
  - **前置**：新 ADR（例如 ADR-0021）定协议范围 + 采集边界
- [x] **TM.2.D** `tracking/funnel` 转化漏斗分析（ADR-0027，无状态 URL 驱动 + CTE 逐步推进）— ~1.8d · 2026-04-30
  - [x] **TM.2.D.1** `TrackingService.aggregateFunnel`（动态 N 步 CTE，2~8 步，`stepWindowMs` 约束，`COALESCE(user_id, session_id)` 去重）+ 单测 — 0.5d · 2026-04-30
    - 输入：`track_events_raw` 已就绪 + `idx_track_project_name_ts` 索引
    - 输出：`apps/server/src/modules/tracking/tracking.service.ts` 追加 `aggregateFunnel()` + `FunnelStepRow` 类型；`apps/server/tests/modules/tracking/funnel.spec.ts`（db=null 短路 / 2 步正常 / 8 步上限 / 超过 8 步拒绝 / 空 steps 拒绝 / stepWindowMs 截断）
    - 验收：`pnpm -F @g-heal-claw/server test` 新增 ≥ 5 case 全绿；SQL 不拼接原始字符串（只拼步骤数，事件名走参数数组）
    - 依赖：无
  - [x] **TM.2.D.2** Dashboard `GET /dashboard/v1/tracking/funnel` —— Controller + Service + Zod DTO（steps CSV 解析 + 范围校验）— 0.3d · 2026-04-30
    - 输入：TM.2.D.1
    - 输出：`dashboard/tracking/funnel.controller.ts` + `funnel.service.ts` + `dto/tracking-funnel.dto.ts`；`dashboard.module.ts` 注册；装配层计算 `conversionFromPrev` / `conversionFromFirst` / `overallConversion`（保留 4 位小数）
    - 验收：Zod 拒绝 steps < 2 / > 8 / windowHours 越界 / stepWindowMinutes 越界；装配层单测覆盖 4 case（正常 / 末步 0 / 首步 0 空窗口 / 舍入边界）
    - 依赖：TM.2.D.1
  - [x] **TM.2.D.3** Web `/tracking/funnel` live 页面 —— `lib/api/funnel.ts` + Client 配置表单（URL sync）+ Server Component 渲染 FunnelChart + 三态 SourceBadge — 0.5d · 2026-04-30
    - 输入：TM.2.D.2
    - 输出：`apps/web/lib/api/funnel.ts`（三态 source）；`app/(console)/tracking/funnel/page.tsx`（Server，读 `searchParams`）+ `funnel-config-form.tsx`（Client，URL replace）+ `funnel-chart.tsx`（横向条形每步递减 + 转化率）
    - 验收：访问 `/tracking/funnel?steps=a,b,c` 展示三步漏斗；未配置时空白态 + 引导；非法参数 → SourceBadge=error
    - 依赖：TM.2.D.2
  - [x] **TM.2.D.4** Demo 场景 `examples/nextjs-demo/app/(demo)/tracking/funnel/`（三步按钮：view_home / click_cta / submit_form） — 0.2d · 2026-04-30
    - 输入：trackPlugin / customPlugin.track 已可用
    - 输出：demo 页面 3 按钮依次触发 `GHealClaw.track(name)`；LogPanel 观察上报；demo-scenarios 登记；ghc-provider 无需改动
    - 验收：`pnpm dev:demo` → 点击三按钮 → Network `type=track` 上报 → `/tracking/funnel?steps=view_home,click_cta,submit_form` 显示 1/1/1 转化
    - 依赖：TM.2.D.3
  - [x] **TM.2.D.5** 文档传导：重写 `apps/docs/docs/guide/tracking/funnel.md` + SPEC / ARCHITECTURE / ADR-0020 Tier 2 补漏斗一节 — 0.3d · 2026-04-30
    - 输入：TM.2.D.1~4
    - 输出：guide/tracking/funnel.md（配置说明 + 示例链接 + 常见问题 + 推迟项）；SPEC §routing 追加 `/dashboard/v1/tracking/funnel` 行；ARCHITECTURE §3.1 TrackingModule 行追加「漏斗聚合」；ADR-0020 §8 Tier 2 增补 funnel 摘要；ADR-0027 「后续」双向引用 demo 路径 + apps/docs 页面
    - 验收：`apps/docs/rspress.config.ts` 侧边栏已含 funnel 链接（已在配，仅确认）；双向可追溯
    - 依赖：TM.2.D.4

- [x] **TM.2.E** `tracking/retention` 用户留存分析（ADR-0028，无状态 URL 驱动 + 单 CTE 两步计算）— ~2.7d · 2026-04-30
  - [x] **TM.2.E.1** `VisitsService.aggregateRetention`（单 CTE：scoped → first_seen → day_offset 交叉，`identity=session|user` 切换，`cohortDays` / `returnDays` 1~30 边界）+ 单测 — 0.8d · 2026-04-30
    - 输入：`page_view_raw` 既有 schema + `idx_pv_project_session_ts` 索引（ADR-0025 模块边界：page_view_raw 归 VisitsService）
    - 输出：`apps/server/src/modules/visits/visits.service.ts` 追加 `aggregateRetention()` + `RetentionMatrixRow` 类型；`apps/server/tests/modules/visits/retention.spec.ts`（db=null 短路 / 正常日 cohort / identity=user 切换 / cohortDays 越界拒绝 / returnDays 越界拒绝 / 时间窗不足拒绝，6 case）
    - 验收：`pnpm -F @g-heal-claw/server test` 新增 6 case 全绿；SQL 单次往返
    - 依赖：无
  - [x] **TM.2.E.2** Dashboard `GET /dashboard/v1/tracking/retention` —— Controller + Service + Zod DTO（window + cohortDays + returnDays + identity）— 0.6d · 2026-04-30
    - 输入：TM.2.E.1
    - 输出：`dashboard/tracking/retention.controller.ts` + `retention.service.ts` + `dto/tracking-retention.dto.ts`；`dashboard.module.ts` 注册；装配层计算 `retentionByDay` / `averageByDay` / `totalNewUsers`（4 位小数 + 跨 cohort 加权平均）
    - 验收：4 case 装配层单测（空 rows → source=empty / 正常矩阵 / averageByDay 加权正确 / error 兜底）
    - 依赖：TM.2.E.1
  - [x] **TM.2.E.3** Web `/tracking/retention` live 页面 —— `lib/api/retention.ts` + Client 配置表单（URL sync）+ Server Component 渲染 Heatmap + Chart + 三态 SourceBadge — 0.8d · 2026-04-30
    - 输入：TM.2.E.2
    - 输出：`apps/web/lib/api/retention.ts`；`app/(console)/tracking/retention/page.tsx`（Server，读 `searchParams`）+ `retention-config-form.tsx`（Client，URL replace）+ `summary-cards.tsx`（totalNewUsers / avg day1 / avg day7）+ `retention-heatmap.tsx`（行 cohort × 列 offset，色阶 0~100%）+ `retention-chart.tsx`（AntV Line，averageByDay 曲线）
    - 验收：访问 `/tracking/retention?cohortDays=7&returnDays=7` 展示矩阵；参数非法 → SourceBadge=error；空数据 → SourceBadge=empty + 引导文案
    - 依赖：TM.2.E.2
  - [x] **TM.2.E.4** Demo 场景 `examples/nextjs-demo/app/(demo)/tracking/retention/` + psql 造数 SQL — 0.2d · 2026-04-30
    - 输入：TM.2.E.3
    - 输出：`page.tsx`（引导性访问按钮 + 文案说明"留存需跨日数据，推荐造数验证"）；页面同目录 `README.md` 附 psql 3 日造数 SQL 模板
    - 验收：`pnpm dev:demo` → 点击访问 → Network `type=page_view` 上报；执行 SQL 造数后 `/tracking/retention` 呈现可视矩阵
    - 依赖：TM.2.E.3
  - [x] **TM.2.E.5** 文档传导：`apps/docs/docs/guide/tracking/retention.md` + SPEC §5 + ARCHITECTURE §3.1 + ADR-0020 §8.2 增补 + CURRENT.md + rspress 侧边栏 — 0.3d · 2026-04-30
    - 输入：TM.2.E.1~4
    - 输出：guide/tracking/retention.md（URL 参数表 · 字段口径 · 身份粒度说明 · 验证链路 · 常见问题）；SPEC §routing 追加 `/dashboard/v1/tracking/retention` 行；ARCHITECTURE §3.1 TrackingModule 行追加「留存聚合」；ADR-0020 §8 追加 8.2 Tier 2.E 落地摘要；ADR-0028 状态 提议 → 采纳 + 「后续」引用 demo 路径 + apps/docs 页面；`rspress.config.ts` 留存菜单链接已在配
    - 验收：双向可追溯；`pnpm -F @g-heal-claw/docs build` 全绿
    - 依赖：TM.2.E.4

### Tier 2.C｜实时监控（`/dashboard/realtime` 菜单，~3.5d，ADR-0030）

> 覆盖：Redis Pub/Sub + Streams 基础设施 + `RealtimeModule` 订阅池 + SSE `/api/v1/stream/realtime` + Gateway 入库后 publish + Web live 页面（EventSource + 虚拟列表 500 + 60s 滚动曲线）。协议范围：仅"平台实时大盘"（观察者视角），用户应用 WS/SSE 观测留独立切片。

- [x] **TM.2.C.1** `RealtimeModule` 骨架 + topic 常量 + Redis Pub/Sub + Streams 封装 — 0.6d ✅ 2026-05-01
  - 输入：`SharedModule.RedisService` 已提供 `ioredis` 连接（T1.3.5 幂等去重已使用）
  - 输出：
    - `apps/server/src/modules/realtime/realtime.module.ts`（@Module，导出 `RealtimeService` + `RealtimePublisher`）
    - `apps/server/src/modules/realtime/topics.ts`（`REALTIME_TOPICS = { ERROR, API, PERF } as const` + 生成函数 `buildChannel(projectId, topic)` / `buildStreamKey(projectId)`）
    - `apps/server/src/modules/realtime/realtime-publisher.ts`（`publish(projectId, topic, payload)` → `XADD MAXLEN ~ 1000` + `PUBLISH`，fire-and-forget，失败 WARN 日志）
    - `app.module.ts` 注册 `RealtimeModule`
  - 验收：`typecheck + build` 全绿；单测 3 case（MAXLEN 命令构造 / publish 失败吞错 / topic channel 格式）；Redis 离线时不抛错
  - 依赖：无

- [x] **TM.2.C.2** Gateway 入库后 publish（fire-and-forget） — 0.4d ✅ 2026-05-01
  - 输入：TM.2.C.1；`GatewayService.ingest*` 现有 3 分流（error / api / perf）已稳定
  - 输出：
    - `GatewayService` 注入 `RealtimePublisher`
    - `ingestError` 入库成功后 `realtime.publish(projectId, 'error', { ts, subType, category, messageHead: msg.slice(0,128), url })`
    - `ingestApi` 同理 publish `'api'`（method/pathTemplate/status/durationMs）
    - `ingestPerformance` 仅当 metric ∈ {LCP,INP,CLS} 时 publish `'perf'`（metric/value/url）
    - `REALTIME_SAMPLE_RATE` env（默认 `1.0`，0~1 浮点）—— `Math.random() >= rate` 跳过 publish；Zod 校验
    - `.env.example` 追加 `REALTIME_SAMPLE_RATE=1.0`
  - 验收：单测 4 case（error/api/perf 各 1 + 采样跳过 1）；publish 失败不影响入库响应；payload 体积 ≤ 256 字节（assert 长度）
  - 依赖：TM.2.C.1

- [x] **TM.2.C.3** `RealtimeService` 订阅池 + Redis Streams 60s 回放 — 0.7d ✅ 2026-05-01
  - 输入：TM.2.C.1
  - 输出：
    - `apps/server/src/modules/realtime/realtime.service.ts`：
      - 持有一条独立 ioredis 订阅连接（`SUBSCRIBE` 必须专用连接）
      - `subscribe(projectId, topics, onEvent): unsubscribe` —— 按 projectId psubscribe `rt:<pid>:*`，在内存 Map 里按 subscriberId 管理过滤器（topic 白名单）
      - `replayFromStream(projectId, lastEventId): AsyncIterable<Event>` —— `XRANGE rt:<pid>:stream (lastEventId +` 读取；最多 1000 条
      - 连接数限流：每 projectId 最多 10 条活跃订阅（`subscriberCounts: Map<projectId, number>`），超出 `subscribe()` 返回 null
    - onModuleInit 建立 psubscribe；onModuleDestroy 关闭连接
  - 验收：单测 5 case（psub 匹配 / topic 过滤 / 超限拒绝 / unsubscribe 释放计数 / replay 空流）；stale subscriber 注册 60s 扫描清理
  - 依赖：TM.2.C.1

- [x] **TM.2.C.4** SSE Controller `/api/v1/stream/realtime` — 0.5d ✅ 2026-05-01
  - 输入：TM.2.C.3
  - 输出：
    - `apps/server/src/modules/realtime/realtime.controller.ts`：
      - `@Controller('api/v1/stream')` · `@Get('realtime')`
      - Zod query `{ projectId, topics?: 'error,api,perf', lastEventId?: string }`
      - `reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })`
      - 若带 `Last-Event-ID` 头则先 `replayFromStream` 写入历史；再订阅实时
      - 心跳：`setInterval(() => reply.raw.write(': ping\n\n'), 15_000)`
      - `reply.raw.on('close')` → unsubscribe + clear interval
      - 429 响应：订阅数满时 `reply.code(429).send({ error: 'subscriber limit' })`
    - Swagger `@ApiTags('realtime')` 标注（响应为 `text/event-stream`）
  - 验收：e2e 3 case（连接 200 + 心跳 + 收到 publish 事件 / 超限 429 / Last-Event-ID 回放）；断连后服务端订阅计数正确释放
  - 依赖：TM.2.C.3

- [x] **TM.2.C.5** Web `/dashboard/realtime` live 页面 — 0.8d ✅ 2026-05-01
  - 输入：TM.2.C.4；`apps/web/lib/nav.ts` `dashboard/realtime` 仍 `placeholder: "SPEC 待补齐（ADR-0013）"`
  - 输出：
    - `apps/web/lib/api/realtime.ts`：`createRealtimeStream({ projectId, topics }): { subscribe, close }` 封装 `EventSource`；自动重连（exponential backoff 1s→30s 上限 5 次）；`readyState` → 三态 source
    - `app/(console)/dashboard/realtime/page.tsx`：`'use client'` + 顶部 `<SourceBadge>` + `StreamHeader`（连接状态 + QPS + topics 筛选 + pause/clear 按钮）
    - `components/realtime/live-feed.tsx`（虚拟列表 500 条，FIFO 丢弃；按 topic 着色：error 红 / api 蓝 / perf 绿）
    - `components/realtime/realtime-chart.tsx`（`@ant-design/plots` Line，前端每秒 tick 聚合 60s 窗口：err QPS / api err % / LCP p75）
    - `lib/nav.ts` `dashboard/realtime` → `placeholder: null`
  - 验收：`pnpm -F @g-heal-claw/web typecheck && build` 全绿；手动启动 demo + server 触发事件 → feed 实时滚动；断连 3s 内自动重连
  - 依赖：TM.2.C.4

- [x] **TM.2.C.6** Demo 场景 + docs — 0.3d ✅ 2026-05-01
  - 输入：TM.2.C.5
  - 输出：
    - `examples/nextjs-demo/app/(demo)/dashboard/realtime/page.tsx`：3 按钮（触发 JS error / 发慢 API / 重载页面触发 LCP 上报）+ iframe 嵌入 `/dashboard/realtime` 对比
    - `demo-scenarios.ts` `dashboard` 分组追加 1 条（若分组不存在则新建）
    - `apps/docs/docs/guide/dashboard/realtime.mdx`：能力简介 + SSE 协议 + 3 topics payload + 前端接入最小代码 + 常见问题（断连 / 采样 / 429）
    - `rspress.config.ts` 侧边栏注册
  - 验收：`pnpm dev:demo` 点三按钮后 live feed 可见对应事件
  - 依赖：TM.2.C.5

- [x] **TM.2.C.7** 文档传导：SPEC / ARCHITECTURE / ADR — 0.2d ✅ 2026-05-01
  - 输入：TM.2.C.6
  - 输出：
    - `docs/SPEC.md §5` 追加 SSE 端点行 `GET /api/v1/stream/realtime`（query + 事件类型 + 协议）
    - `docs/ARCHITECTURE.md §3.1` 追加 `RealtimeModule`（从"规划"改"已实现 3 topics"）；§4.3 标注首版已落地
    - `docs/decisions/0030-dashboard-realtime-slice.md` 状态 提议 → 采纳 + 「后续」引用 demo 路径 + apps/docs 页面
    - `.env.example` 补 `REALTIME_SAMPLE_RATE`
    - `CURRENT.md` TM.2.C.1~7 `[x]` + "当前焦点"更新
  - 验收：双向可追溯；`pnpm -F docs build` 全绿
  - 依赖：TM.2.C.6

### Tier 3｜总览收口（~1.5d，ADR-0029）

> 5 域 MVP（errors / performance / api / resources / visits）+ 全站健康度（加权公式 errors 40% + LCP 25% + API 20% + resources 15%）。放弃在 overview 拼 custom/logs/tracking。零 SDK / 零新表。

- [x] **TM.3.A.1** `DashboardOverviewService` 装配层 + 健康度计算 — 0.5d
  - 输入：5 域 service `aggregateSummary`/`aggregateVitals` 已全部就绪
  - 输出：
    - `apps/server/src/dashboard/dashboard/overview.service.ts`：
      - `getOverview({ projectId, windowHours })` → `Promise.allSettled([errors, perf, api, resources, visits])`
      - 每域 `source: 'live' | 'empty' | 'error'`（失败时 reason 落 WARN 日志）
      - 健康度：`calcHealth({ errors, perf, api, resources })` 纯函数
        - `errorRate = errors.totalEvents / max(errors.impactedSessions, 1)`（阈值 0.005 开始扣分，1.0 扣满）
        - `lcpPenalty`：LCP p75 ≤ 2500 → 0；2500~4000 线性到 0.5；> 4000 → 1
        - `apiErrorRatePenalty`：阈值 0.01 开始扣分，0.1 扣满
        - `resourceFailurePenalty`：阈值 0.02 开始扣分，0.2 扣满
        - 有效域权重动态归一化（空样本域的权重按比例挪给其他域）
        - 返回 `{ score: round(0~100), tone, components: Array<{ key, contribution, penalty }> }`
      - 全 5 域 empty → `tone: 'unknown'`, `score: null`
    - 目录：新建 `apps/server/src/dashboard/dashboard/` 子树（对齐 web）
  - 验收：单测 ≥8 case（每域 empty / error 各 1 + 全绿正常路径 + 全 empty unknown + 各 penalty 边界 3 case + 权重归一化）
  - 依赖：无

- [x] **TM.3.A.2** DTO + Controller + 路由 — 0.25d
  - 输入：TM.3.A.1
  - 输出：
    - `apps/server/src/dashboard/dto/overview-summary.dto.ts`：Zod query + response Schema
      ```ts
      OverviewSummarySchema = z.object({
        health: z.object({ score: z.number().nullable(), tone: z.enum(['good','warn','destructive','unknown']), components: z.array(HealthComponentSchema) }),
        errors: ErrorsCardSchema,
        performance: PerformanceCardSchema,
        api: ApiCardSchema,
        resources: ResourcesCardSchema,
        visits: VisitsCardSchema,
        generatedAtMs: z.number(),
      })
      ```
    - `apps/server/src/dashboard/dashboard/overview.controller.ts`：`@Get('/dashboard/v1/overview/summary')` + Zod query pipe + Swagger
    - `dashboard.module.ts` 追加 import + register
  - 验收：Swagger 端点可见；Zod 校验失败 400；空 projectId 400
  - 依赖：TM.3.A.1

- [x] **TM.3.A.3** Web `/dashboard/overview` live 页面 — 0.5d
  - 输入：TM.3.A.2
  - 输出：
    - `apps/web/lib/api/overview.ts`：`getOverviewSummary()` + `emptyOverviewSummary()` + 三态 source
    - `app/(console)/dashboard/overview/page.tsx`：Server Component，`export const dynamic = 'force-dynamic'`
    - `components/overview/health-hero-card.tsx`（大号 score + tone Badge + top 3 扣分项 tooltip）
    - `components/overview/domain-summary-card.tsx`（通用 5 卡，接 `{ title, icon, metrics: [{label, value, tone?}], href, source }`）
    - 5 个 card 入参：errors / performance / api / resources / visits
    - `lib/nav.ts` `dashboard/overview` → `placeholder: null`
  - 验收：`pnpm -F @g-heal-claw/web typecheck && build` 全绿；5 卡 tap 跳转对应子页；empty/error 态 graceful
  - 依赖：TM.3.A.2

- [x] **TM.3.A.4** Demo + 单测 e2e — 0.15d
  - 输入：TM.3.A.3
  - 输出：
    - `examples/nextjs-demo/app/(demo)/dashboard/overview/page.tsx`：引导性按钮（触发 1 次 error + 1 次 api 500 + 1 次 LCP 上报 + 1 次页面访问）+ 刷新链接 `/dashboard/overview`
    - `demo-scenarios.ts` 追加 1 条
    - e2e（`apps/server/tests/e2e/overview.e2e-spec.ts`）：ingest 5 种事件后 GET overview → 5 域均 live + health score > 0
  - 验收：`pnpm -F @g-heal-claw/server test` 新增 e2e 全绿
  - 依赖：TM.3.A.3

- [x] **TM.3.A.5** 文档传导 — 0.1d
  - 输入：TM.3.A.4
  - 输出：
    - `apps/docs/docs/guide/dashboard/overview.mdx`：概念 + 5 域覆盖 + 健康度公式 + 权重说明 + FAQ
    - `rspress.config.ts` 侧边栏注册
    - `docs/SPEC.md §5` 追加 `/dashboard/v1/overview/summary` 行
    - `docs/ARCHITECTURE.md §3.1` DashboardModule 描述补 overview 装配
    - `docs/decisions/0029-dashboard-overview-slice.md` 状态 提议 → 采纳
    - `CURRENT.md` TM.3.A.1~5 `[x]` + "当前焦点" 更新
  - 验收：双向可追溯；`pnpm -F docs build` 全绿
  - 依赖：TM.3.A.4

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
- [x] **T2.1.2** 首屏时间（MutationObserver + rAF 窗口）— 2d（随 T2.1.8.P0.3 交付，fspPlugin 已落地 2026-05-06）
- [x] **T2.1.3** 长任务 / 卡顿 / 无响应采集 — 2d（≥50ms 采集 + 三级分级 classifyLongTaskTier + UI 三色条，随 T2.1.8.P0.2 交付 2026-05-06）
- [x] **T2.1.4** PerformanceProcessor（metric_minute 预聚合 + BullMQ 异步消费）— 3d（ADR-0037）
  - [x] **T2.1.4.1** `metric_minute` Drizzle Schema + DDL migration `0012_metric_minute.sql` — 0.4d
    - 输入：ADR-0037 表设计
    - 输出：`apps/server/src/shared/database/schema/metric-minute.ts` + migration + schema.ts re-export
    - 验收：`pnpm typecheck` 全绿；迁移 SQL 可执行
    - 依赖：无
  - [x] **T2.1.4.2** Gateway 性能事件异步化（`PERF_PROCESSOR_MODE` 灰度开关）— 0.6d
    - 输入：T2.1.4.1；复用 ADR-0026 enqueue 模式
    - 输出：`gateway.service.ts` 扩展 perf 分流 + `ServerEnvSchema` 新增 3 env
    - 验收：单测覆盖 sync/queue/dual 三模式；e2e 含 `enqueued` 字段
    - 依赖：T2.1.4.1
  - [x] **T2.1.4.3** PerformanceProcessor Worker（消费 + saveBatch + 分钟聚合 → UPSERT metric_minute）— 1.2d
    - 输入：T2.1.4.1 + T2.1.4.2
    - 输出：`apps/server/src/modules/performance/perf.processor.ts`（@Processor + tdigest 百分位 + UPSERT）
    - 验收：单测 mock 验证分钟桶聚合 + UPSERT 幂等 + 重试入 DLQ
    - 依赖：T2.1.4.1, T2.1.4.2
  - [x] **T2.1.4.4** 单测 + 环境变量 + 文档传导 — 0.8d
    - 输入：T2.1.4.1~3
    - 输出：单测 ≥ 8 case + `.env.example` + ARCHITECTURE §3.4 更新 + CURRENT.md
    - 验收：`pnpm typecheck && pnpm test` 全绿
    - 依赖：T2.1.4.1~3
- [x] **T2.1.5** Apdex 计算 cron — 1d（ADR-0037）
  - [x] **T2.1.5.1** ApdexService（@Cron 每分钟 + LCP 阈值判定 + UPSERT metric_minute）— 0.7d
    - 输入：T2.1.4.1（metric_minute 表已就绪）
    - 输出：`apps/server/src/modules/performance/apdex.service.ts` + `ServerEnvSchema` 新增 `APDEX_THRESHOLD_MS` / `APDEX_METRIC`
    - 验收：单测覆盖正常计算 + 空窗口跳过 + ENV 禁用
    - 依赖：T2.1.4.1
  - [x] **T2.1.5.2** 单测 + 文档传导 + apps/docs 页面 — 0.3d
    - 输入：T2.1.5.1
    - 输出：单测 ≥ 4 case + `apps/docs/docs/reference/performance-metrics.md` 追加 Apdex 章节 + CURRENT.md
    - 验收：`pnpm typecheck && pnpm test` 全绿；Apdex 公式文档化
    - 依赖：T2.1.5.1
- [x] **T2.1.6** 性能大盘 API 首版（依据 ADR-0015，直查 `perf_events_raw` + p75 聚合；Apdex/metric_minute 预聚合推迟到 T2.1.4/T2.1.5）— 2d（完成 2026-04-27）
  - [x] **T2.1.6.1** `apps/server/src/dashboard/` 骨架：`dashboard.module.ts` + `performance.controller.ts` + `performance.service.ts` + `dto/overview.dto.ts`（Zod query + response Schema）— 0.2d（完成 2026-04-27）
  - [x] **T2.1.6.2** 聚合 SQL：扩展 `PerformanceService` 新增 `aggregateVitals` / `aggregateTrend` / `aggregateWaterfallSamples` / `aggregateSlowPages`（Drizzle + `sql` 模板 + `percentile_cont`）— 0.6d（完成 2026-04-27）
  - [x] **T2.1.6.3** DashboardService 装配：并发 5 次查询（含环比）→ 映射 `ThresholdTone` / `DeltaDirection` → 返回 `PerformanceOverviewDto`；空数据返回 5 卡占位 `sampleCount=0`（不报错）— 0.3d（完成 2026-04-27）
  - [x] **T2.1.6.4** Controller + Swagger 注解 + `ZodValidationPipe(query)` + `AppModule` 注册 — 0.1d（完成 2026-04-27）
  - [x] **T2.1.6.5** `apps/web/lib/api/performance.ts` 改为真实 fetch + `emptyOverview()` 降级 + `source` 三态；`apps/web/.env.example` 新增 `NEXT_PUBLIC_DEFAULT_PROJECT_ID=proj_demo`；移除 `lib/fixtures/performance.ts` — 0.2d（完成 2026-04-27）
  - [x] **T2.1.6.6** `apps/web/app/(console)/monitor/performance/page.tsx`（ADR-0021 菜单重组后路由迁移自 `(dashboard)/performance/`）处理 live/empty/error 三态；`export const dynamic = "force-dynamic"` 避免 SSG 冻结 — 0.2d（完成 2026-04-27）
  - [x] **T2.1.6.7** 端到端验证：server typecheck/build/test（5/5 全绿）；web typecheck/build（`/performance` 标记 ƒ Dynamic）— 0.4d（完成 2026-04-27）
- [x] **T2.1.7** web/performance 页面增强（环比切换 / 分页面瀑布图 / 图表定制）— 5d（2026-05-06 全部完成）
  - [x] **T2.1.7.1** 环比视图组件（当前 vs 前周期切换 Tab + 指标卡 delta 高亮）— 1d（完成 2026-05-06）
    - 输入：后端已返回 `deltaPercent` / `deltaDirection`；前端已渲染但无切换交互
    - 输出：`core-vitals-panel.tsx` 增加"环比"Tab 切换 + 前周期数据并列展示
    - 验收：点击环比 Tab 显示两列数据对比；无数据态正常
    - 依赖：无
  - [x] **T2.1.7.2** 分页面瀑布图（按 URL path 分组 + 可展开子瀑布）— 1.5d（完成 2026-05-06）
    - 输入：后端 `aggregateWaterfallSamples` 已按 path 可分组
    - 输出：`page-waterfall.tsx` 改造为可选择页面路径 + 独立瀑布渲染
    - 验收：下拉选择具体页面后瀑布图更新；默认展示全局聚合
    - 依赖：无
  - [x] **T2.1.7.3** 趋势图增强（多指标叠加 + tooltip 丰富 + 时间轴联动）— 1.5d（完成 2026-05-06）
    - 输入：前端 AntV Line 已渲染基础趋势
    - 输出：`trend-chart.tsx` 支持 legend 切换多指标 + crosshair tooltip + 时间轴缩放
    - 验收：可同时展示 LCP + FCP + TTFB 趋势；tooltip 显示精确值
    - 依赖：无
  - [x] **T2.1.7.4** 收尾（typecheck + build + 体验微调）— 1d（完成 2026-05-06）
    - 输入：T2.1.7.1~3
    - 输出：全部组件 typecheck 通过 + build 通过 + 响应式适配
    - 验收：`pnpm -F @g-heal-claw/web typecheck && build` 全绿；`pnpm test` 全绿
    - 依赖：T2.1.7.1~3
- [x] **T2.1.8** 性能模块完整性切片（ADR-0018；SDK 已落地 longTaskPlugin / speedIndexPlugin，本切片补齐 FSP + 长任务分级 + SI 趋势白名单 + 回归测试 + 面板润色）— 5d（2026-05-06 全部完成）
  - **P0（指标矩阵完整性，阻断）**
    - [x] **T2.1.8.P0.1** 核实 SI 后端聚合路径：`aggregateTrend` 白名单已含 `'SI'`（第 284 行）；`aggregateVitals` 通过 `metric IS NOT NULL` 自动纳入 — 已验证
    - [x] **T2.1.8.P0.2** 长任务 3 级分级（原 T2.1.3）：SDK `classifyLongTaskTier` 已就绪 + 后端 `tiers` 已返回 + Web 面板长任务卡三色进度条（emerald/amber/rose） — 2026-05-06
    - [x] **T2.1.8.P0.3** FSP 插件（原 T2.1.2）：`fsp.ts` MutationObserver + rAF + settle 1s + load 兜底 + pagehide 封板；已导出 + demo 注册 + 服务端 firstScreen 优先 FSP p75 — 已落地
  - **P1（回归保障）**
    - [x] **T2.1.8.P1.1** `long-task.test.ts` + `speed-index.test.ts` + `fsp.test.ts` 已存在（SDK 97/97 全绿） — 已落地
    - [x] **T2.1.8.P1.2** `performance.service.spec.ts` 覆盖聚合函数（370+6 全绿） — 已落地
    - [x] **T2.1.8.P1.3** Topbar 时间范围 → URL 联动 + `resolveWindowHours` + 全页面消费 — 2026-05-06 完成
  - **P2（体验润色）**
    - [x] **T2.1.8.P2.1** `DeprecatedBadge` + `deprecated: true`（FID/TTI）已渲染 — 已落地
    - [x] **T2.1.8.P2.2** 瀑布 tooltip 含 p75 公式 + metric_minute 迁移锚点注释 — 已落地
  - **刻意排除**
    - Apdex cron（T2.1.5，依赖 Apdex T 项目级配置，等 T1.1.7 认证）
    - `perf_events_raw` 表扩列（deviceModel / region / network），Phase 2 后期
    - `metric_minute` 预聚合（T2.1.4，另起 ADR）

### M2.2 API 监控

- [x] **T2.2.1** SDK ApiPlugin（劫持 fetch + XHR，采集 method/url/status/duration/size）— 3d
- [x] **T2.2.2** 慢请求 & 错误请求扩展字段（请求/响应体 4KB 截断 + captureBody 选项）— 2d（完成 2026-05-07）
- [x] **T2.2.3** TraceID 注入（可配置 header 名 `traceIdHeaderName` + 32 字符 hex ID）— 1d（完成 2026-05-07）
- [x] **T2.2.4** ApiProcessor（按 method+path 聚合；pathTemplate 提取，如 `/api/users/123` → `/api/users/:id`）— 3d
- [x] **T2.2.5** API 大盘 API（总览 / 慢请求 Top / 错误 Top / 按域名/状态码分析）— 2d
- [x] **T2.2.6** web/api 页面 — 4d

### M2.3 访问分析

- [x] **T2.3.1** SDK PageViewPlugin（首次 + SPA 路由监听 + session 保活）— 2d
- [x] **T2.3.2** VisitProcessor（PV/UV，会话聚合，IP 地域解析）— 3d
- [x] **T2.3.3** IP 地域库加载与缓存（MaxMind GeoLite2-City.mmdb + page_view_raw 扩列 country/region/city）— 1d（完成 2026-05-07）
- [x] **T2.3.4** 访问大盘 API（总览 / Top 页面 / 访问来源 / 地域分布 / 会话详情）— 2d
- [x] **T2.3.5** web/visits 页面 + 会话详情路径还原 — 4d

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

### M4.1 告警引擎（ADR-0035）

- [x] **T4.1.1** Drizzle Schema + DDL + 迁移（`alert_rules` / `alert_history` / `channels` 3 表）+ shared 队列名常量 — 1d（2026-05-06 完成：3 schema + ALERT_DDL + 0010 迁移 + 3 ID 前缀 alr/alh/ch）
  - 输入：ADR-0035 §2 DDL 定义
  - 输出：`apps/server/src/shared/database/schema/alert-rules.ts` + `alert-history.ts` + `channels.ts` + `drizzle/0010_alert_tables.sql` + `packages/shared` 追加 `QueueName.AlertEvaluator` / `QueueName.Notifications`
  - 验收：`pnpm typecheck` 全绿；DDL 幂等执行无报错
  - 依赖：无
- [x] **T4.1.2** AlertModule 骨架（AlertService CRUD + AlertController + Zod DTO）— 1.5d
  - 输入：T4.1.1
  - 输出：`apps/server/src/modules/alert/alert.module.ts` + `alert.service.ts` + `alert.controller.ts` + `dto/`（CreateAlertRuleSchema / UpdateAlertRuleSchema / AlertHistoryQuerySchema）
  - 验收：Swagger 可见 5 端点（GET list / POST create / PATCH update / DELETE / GET history）；Zod 校验生效
  - 依赖：T4.1.1
- [x] **T4.1.3** 告警评估引擎（cron + 5 种 target 查询抽象 + 状态机）— 2d
  - 输入：T4.1.2；各域 Service 的 aggregate 方法已就绪
  - 输出：`apps/server/src/modules/alert/alert-evaluator.service.ts`（`@Cron('*/1 * * * *')` + evaluateAll + target→SQL 映射 + cooldown 判定 + firing/resolved 状态机）
  - 验收：单测覆盖 5 种 target 评估 + cooldown 静默 + resolved 自动标记；`pnpm test` 全绿
  - 依赖：T4.1.2
- [x] **T4.1.4** 预置规则下发（ProjectsService.create 内自动插入 6 条模板）— 0.5d
  - 输入：T4.1.2
  - 输出：`apps/server/src/modules/alert/preset-rules.ts`（6 条规则定义）+ `projects.service.ts` create 事务追加
  - 验收：创建新项目后 `alert_rules` 表有 6 条 `enabled=false` 记录
  - 依赖：T4.1.2

### M4.2 通知渠道（ADR-0035）

- [x] **T4.2.1** NotificationModule 骨架（ChannelService CRUD + NotificationWorker + BullMQ）— 1.5d
  - 输入：T4.1.1（队列名 + channels 表）
  - 输出：`apps/server/src/modules/notification/notification.module.ts` + `channel.service.ts` + `channel.controller.ts` + `notification.worker.ts`（`@Processor(QueueName.Notifications)`）
  - 验收：渠道 CRUD 端点可用；Worker 消费日志可见
  - 依赖：T4.1.1
- [x] **T4.2.2** 5 种 Provider 实现 + 模板渲染 — 2d
  - 输入：T4.2.1
  - 输出：`providers/email.provider.ts` + `dingtalk.provider.ts` + `wecom.provider.ts` + `slack.provider.ts` + `webhook.provider.ts` + `template.ts`（变量替换引擎）
  - 验收：每种 Provider 有独立单测 mock HTTP 验证 payload 格式；模板 `{{rule.name}}` 正确替换
  - 依赖：T4.2.1
- [x] **T4.2.3** 评估 → 通知联动（AlertEvaluator 触发时向 notifications 队列投递）— 0.5d
  - 输入：T4.1.3 + T4.2.1
  - 输出：`alert-evaluator.service.ts` 命中后 `this.notificationQueue.add(...)`
  - 验收：规则命中后 notifications Worker 日志输出对应渠道发送记录
  - 依赖：T4.1.3, T4.2.1
- [-] **T4.2.4** 短信渠道 — 推迟（需真实 API Key）
- [x] **T4.2.5** Web `/settings/alerts` 规则管理页面 — 1.5d
  - 输入：T4.1.2 API 就绪
  - 输出：`apps/web/app/(console)/settings/alerts/page.tsx` + `components/settings/alert-*`（规则表格 + 创建/编辑对话框 + 启停开关 + 历史列表）+ `lib/api/alerts.ts`
  - 验收：`typecheck && build` 全绿；规则 CRUD 可交互；nav.ts placeholder 清空
  - 依赖：T4.1.2
- [x] **T4.2.6** Web `/settings/channels` 渠道管理页面 — 1.5d
  - 输入：T4.2.1 API 就绪
  - 输出：`apps/web/app/(console)/settings/channels/page.tsx` + `components/settings/channel-*`（渠道表格 + 创建对话框含类型选择 + 测试发送按钮）+ `lib/api/channels.ts`
  - 验收：`typecheck && build` 全绿；5 种渠道类型可创建；测试发送按钮触发 Worker；nav.ts placeholder 清空
  - 依赖：T4.2.1
- [x] **T4.2.7** 单测 + 文档传导 — 1d
  - 输入：T4.1.1 ~ T4.2.6 全部完成
  - 输出：`tests/modules/alert/` + `tests/modules/notification/`（≥ 20 case）+ `apps/docs/docs/guide/dashboard/alerts.md` + `apps/docs/docs/reference/alerts.md` + SPEC/ARCHITECTURE 同步 + CURRENT.md 更新 + ADR-0035 状态采纳
  - 验收：`pnpm test` 全绿；双向可追溯；nav.ts alerts + channels 均 live
  - 依赖：T4.1.1 ~ T4.2.6

---

## Phase 5：AI 诊断 + 自愈（ADR-0036）

**目标**：Issue 一键自愈 → AI 诊断 → 自动生成 PR。

### M5.1 AI Agent 基础

- [x] **T5.1.1** `apps/ai-agent` 脚手架（纯 Node.js + BullMQ Worker + 环境变量 + typecheck）— 1d（完成 2026-05-07）
  - 输入：`packages/shared` 已定义 `AiAgentEnvSchema` + `QueueName.AiDiagnosis`
  - 输出：`apps/ai-agent/`（package.json + tsconfig.json + src/main.ts + src/worker.ts）；pnpm workspace 自动发现
  - 验收：`pnpm -F @g-heal-claw/ai-agent typecheck` 全绿；BullMQ Worker 启动并 log `[ai-agent] listening queue=ai-diagnosis`
  - 依赖：无
- [x] **T5.1.2** 模型封装（Anthropic 主 + OpenAI 备 + 统一接口）— 0.5d（完成 2026-05-07）
  - 输入：T5.1.1
  - 输出：`src/model/provider.ts`（createModel 工厂：优先 Claude Opus 4.7，ANTHROPIC_API_KEY 缺失时降级 GPT-4o）
  - 验收：typecheck 通过
  - 依赖：T5.1.1
- [x] **T5.1.3** Agent Tools — 5 个核心工具 — 2d（完成 2026-05-07）
  - 输入：T5.1.1 + T5.2.2（heal_jobs 表可查）
  - 输出：`src/tools/`（read-issue.ts / read-file.ts / grep-repo.ts / write-patch.ts / create-pr.ts）
  - 验收：typecheck 通过；isPathAllowed 单测 5 case 全绿
  - 依赖：T5.1.1, T5.2.2
  - 子任务：
    - [x] **T5.1.3.1** `readIssue` — 从 DB 读取 issue 上下文（title + stack + breadcrumbs + recent events）
    - [x] **T5.1.3.2** `readFile` — 从克隆仓库读源码（限 500 行，路径白名单校验）
    - [x] **T5.1.3.3** `grepRepo` — 在仓库内搜索模式（限 50 条结果）
    - [x] **T5.1.3.4** `writePatch` — 生成 unified diff + AI_MAX_PATCH_LOC 校验
    - [x] **T5.1.3.5** `createPr` — simple-git push branch + @octokit/rest 创建 PR
- [x] **T5.1.4** ReAct 循环 + 护栏 + trace — 1.5d（完成 2026-05-07）
  - 输入：T5.1.2 + T5.1.3
  - 输出：`src/react/loop.ts`（deepagents createDeepAgent + recursionLimit 步数限制 + ToolMessage trace 收集）；`src/agent/prompt.ts`（系统提示词）
  - 验收：typecheck 通过
  - 依赖：T5.1.2, T5.1.3

### M5.2 HealModule（Server 侧）

- [x] **T5.2.1** `heal_jobs` Schema + DDL migration — 0.5d（完成 2026-05-07）
  - 输入：ADR-0036 数据模型定义；`packages/shared/src/queues/heal-job.ts` 已定义队列 payload
  - 输出：`apps/server/src/shared/database/schema/heal-jobs.ts` + `drizzle/0011_heal_jobs.sql`
  - 验收：`pnpm -F @g-heal-claw/server typecheck` 全绿
  - 依赖：无
- [x] **T5.2.2** HealModule（Service + Controller + Worker）— 1.5d（完成 2026-05-07）
  - 输入：T5.2.1
  - 输出：`apps/server/src/modules/heal/`（heal.module.ts + heal.service.ts + heal.controller.ts + heal-result.worker.ts + dto/）
  - 验收：`pnpm -F @g-heal-claw/server typecheck && test` 全绿；4 端点注册
  - 依赖：T5.2.1
  - 子任务：
    - [x] **T5.2.2.1** `HealService`（createJob + listJobs + getJob + cancelJob + updateJobStatus）
    - [x] **T5.2.2.2** `HealController`（4 端点 + JwtAuthGuard + ProjectGuard + Swagger）
    - [x] **T5.2.2.3** `HealResultWorker`（消费 `ai-heal-fix` 队列，更新 heal_job 终态 + completedAt）
- [x] **T5.2.3** 仓库配置读取（`.ghealclaw.yml`）— 0.5d（完成 2026-05-07）
  - 输入：T5.1.3（Agent clone 仓库后需读配置）
  - 输出：`apps/ai-agent/src/config/repo-config.ts`（YAML 解析 + 默认值合并 + Zod 校验 + isPathAllowed）
  - 验收：单测 5 case 全绿（白名单/黑名单/默认）
  - 依赖：T5.1.1

### M5.3 Git 集成（MVP 范围：仅 GitHub）

- [x] **T5.3.1** GitHub App 集成（clone + push + PR 创建）— 1.5d（完成 2026-05-07）
  - 输入：T5.1.3.5 的 createPr 工具定义
  - 输出：`apps/ai-agent/src/tools/create-pr.ts`（simple-git + @octokit/rest PR 创建，集成在 createPr tool 内）
  - 验收：typecheck 通过
  - 依赖：T5.1.1
- [x] **T5.3.2** PR 内容模板 — 0.5d（完成 2026-05-07）
  - 输入：T5.3.1
  - 输出：`apps/ai-agent/src/git/pr-template.ts`（Markdown 模板：诊断摘要 + 根因 + Issue 链接 + labels + 审阅建议）
  - 验收：typecheck 通过
  - 依赖：T5.3.1

### M5.3+ 沙箱与后续（本期 MVP 推迟）

- [-] **T5.3.3** Docker 沙箱封装 — 推迟至下一迭代（ADR-0036 决议）
- [-] **T5.3.4** GitLab PAT 集成 — 推迟
- [-] **T5.3.5** web/heal 任务中心 UI — 推迟

### M5.4 端到端验证

- [x] **T5.4.0** 端到端联调 + 文档传导 — 1d（完成 2026-05-07）
  - 输入：T5.1.4 + T5.2.2 + T5.3.1
  - 输出：typecheck 全包全绿（7 packages）+ test 全绿（538 cases）+ ADR-0036 采纳 + `apps/docs/docs/reference/heal-api.md` + `apps/docs/docs/guide/settings/ai.md`
  - 验收：`pnpm typecheck && pnpm test` 全绿；文档双向可追溯（ADR ↔ docs）
  - 依赖：T5.1.4, T5.2.2, T5.3.2

### M5.4+ 质量验证（后续迭代）

- [-] **T5.4.1** Docker 沙箱 verify 阶段 — 推迟
- [-] **T5.4.2** Heal 回归数据集 — 推迟
- [-] **T5.4.3** 安全审计 — 推迟

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
- [ ] **TX.2** 压测基线更新（k6 Gateway + Processor 指标刷新）— 0.5d
  - 输入：`apps/server/bench/ingest.k6.js` 已存在
  - 输出：执行压测并记录基线数字到 bench/README.md
  - 验收：p95 / p99 / 吞吐量数字记录
  - 依赖：无
- [x] **TX.3** SDK 体积预算 CI Gate（变更超 1KB 需审批）— 0.5d
  - 输入：CI workflow 已就绪
  - 输出：`.github/workflows/ci.yml` 追加 SDK size check step
  - 验收：PR 中 SDK 体积增幅 > 1KB 时 CI 标红
  - 依赖：无
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

- 已完成（2026-05-06）：**T1.6.2~T1.6.6 Issues CRUD 全部完成** —— DashboardIssuesController + Service（GET 列表分页/筛选/排序 + GET 详情含近期事件 + PATCH 状态变更）；Zod DTO（IssuesListQuerySchema / IssueStatusUpdateSchema）；Web Issues 列表页（状态 Tab 筛选 + 分页 + 相对时间）+ 详情页（概览卡片 + 堆栈 + 设备标签 + 状态操作按钮）；异常分析页增加 Issues 入口链接；server + web typecheck 全绿
- 已完成（2026-05-06）：**T1.2.4 contextPlugin（UTM + 搜索引擎 + 流量渠道归因）**
- 已完成（2026-05-01）：**TM.2.C 实时监控切片（ADR-0030，7 子任务全部 `[x]`）** —— `RealtimeModule` 骨架（topics.ts 常量 + channelKey/streamKey 生成）+ `RealtimeService`（Symbol-keyed 订阅池 + 独立 ioredis subscriber + psubscribe `rt:<pid>:*` + XRANGE 60s 回放 + 每 projectId 最多 10 并发 SSE）+ `RealtimeController` SSE `/api/v1/stream/realtime`（Fastify `reply.hijack()` + 手写 SSE 帧 + 15s 心跳 + Last-Event-ID 回放 + 429 限流）+ Gateway 入库后 fire-and-forget `realtime.publish()`（XADD MAXLEN ~1000 + PUBLISH；仅 error/api/perf(LCP|INP|CLS)；`REALTIME_SAMPLE_RATE` 控制）+ Web `/dashboard/realtime` live 页（EventSource 封装 + 指数退避重连 1s→30s 5 次 + 500 条 FIFO + 10s 窗口 QPS + topic 过滤 + pause/clear + 三态 SourceBadge）+ demo `/dashboard/realtime` 触发器 + `apps/docs/docs/guide/dashboard/realtime.md` 全量重写 + SPEC §5.3 SSE 端点行 + ARCHITECTURE §3.1/§4.3 已实现标注 + ADR-0030 采纳；server typecheck + 10 新增单测全绿 + web typecheck 全绿
- 已完成（2026-04-30）：**TM.3.A 数据总览切片（ADR-0029，5 子任务全部 `[x]`）** —— `DashboardOverviewService`（`Promise.allSettled` 并发 5 域 + `calcHealth` 纯函数 + 权重重分配 + 11 case 单测）+ `overview-summary.dto.ts`（Zod query + response + HealthComponent）+ `DashboardOverviewController` `/dashboard/v1/overview/summary` + Web `/dashboard/overview` live 页（`lib/api/overview.ts` + `HealthHeroCard` + 5 张等宽 `DomainSummaryGrid` + 三态 SourceBadge）+ demo `/dashboard/overview`（一键触发 errors + api + resources + LCP 样本）+ `apps/docs/docs/guide/dashboard/overview.md` 全量重写（健康度公式 + 接口样例 + FAQ）+ ADR-0029 提议 → 采纳 + nav placeholder 清空；server typecheck + web typecheck + 单测 11/11 全绿
- 已完成（2026-04-30）：**TM.2.E 用户留存切片（ADR-0028，5 子任务全部 `[x]`）** —— `VisitsService.aggregateRetention`（单次 CTE：scoped → first_seen（HAVING 约束首访在 cohort 窗口）→ visits；identity=session\|user 切换；7 case 单测）+ `DashboardRetentionService/Controller`（装配层 4 case 单测：空 rows/正常矩阵/加权平均/error 兜底 · `retentionByDay` day 0 恒为 1 + 缺失 offset 补 0 · `averageByDay` 按 cohortSize 加权而非简单平均 · 三态 source live/empty/error 不 5xx）+ Web `/tracking/retention` live 页（`lib/api/retention.ts` URL 解析夹紧 + Server Component + `retention-config-form.tsx` URL replace + `summary-cards.tsx` + `retention-heatmap.tsx` CSS Grid 绿色色阶热力图 + `retention-chart.tsx` AntV Line + 三态 SourceBadge）+ demo `/tracking/retention`（刷新 / SPA 导航 / 重置 session 3 触发器 + `README.md #留存造数` psql 3cohort×3session 脚本）+ `apps/docs/docs/guide/tracking/retention.md` 全量重写（URL 参数表 + 字段口径 + psql 验证链路 + FAQ）+ SPEC §5.3 新增 `/dashboard/v1/tracking/retention` 行 + ARCHITECTURE §3.1 VisitsModule 追加 aggregateRetention + §3.2 tracking/retention 从"规划"改为"✅ ADR-0028" + ADR-0020 §8.2 Tier 2.E 落地摘要 + ADR-0028 状态提议 → 采纳；server 7+4 新增单测全绿 + web typecheck & build 全绿
- 已完成（2026-04-30）：**TM.E ErrorProcessor BullMQ 接管（ADR-0026，7 子任务全部 `[x]`）** —— `shared/queue/queue.module.ts` 全局 BullMQ 连接（Redis URL + 默认 removeOnComplete/removeOnFail）；`modules/sourcemap/*` Service stub（本期原样返回，T1.5.3 替换实现体无需改 Processor）；`modules/errors/error.processor.ts` `@Processor(events-error)` + `concurrency=4` + `@OnWorkerEvent('failed')` 终态 → `DeadLetterService.enqueueEvents`；`modules/partitions/*` `@Cron('0 3 * * 1')` + onModuleInit 立即 tick + ISO 周工具（toIsoWeekMonday/addDays/weeklyPartitionName）+ LOOKAHEAD_WEEKS=8；`gateway.service.ts` `ERROR_PROCESSOR_MODE` 灰度（queue/sync/dual）+ Redis 失败降级 sync + 响应新增 `enqueued` 字段；`ddl.ts` 扩 5 张周分区（2026w21~2026w25，覆盖 2026-05-18~2026-06-22）；`shared/env/server.ts` 新增 5 键；server 260 单测 + 6 e2e + typecheck 全绿；ADR-0026 状态提议 → 采纳；SPEC §5.1 响应补 `enqueued`；ARCHITECTURE §3.4 events-error 🟡 → 🟢 + §4.1.1/§4.1.2 当前实现 vs 目标实现拆分；`.env.example` 追加 2 键；`apps/docs/docs/reference/error-processor.mdx` + `apps/docs/docs/guide/ops/partition-maintenance.mdx` 新建；demo `examples/nextjs-demo/app/errors/page.tsx` 注释追加 `[ErrorProcessor]` 日志观察指引
- 已完成（2026-04-30）：**TM.2.D 转化漏斗切片（ADR-0027）** —— `TrackingService.aggregateFunnel`（动态 N 步 CTE，9 case 单测）+ `DashboardFunnelService/Controller`（4 case 装配层单测 · conversionFromPrev/conversionFromFirst/overallConversion 4 位小数 + 首末步 0 保护）+ Web `/tracking/funnel` live 页（URL 驱动配置表单 + SummaryCards + FunnelChart + StepsTable + 三态 SourceBadge）+ demo `/tracking/funnel` 3 按钮 + `apps/docs/docs/guide/tracking/funnel.md` + SPEC/ARCHITECTURE/ADR-0020 §8.1 同步；server 237+4/241 全绿 + web/demo typecheck 全绿
- 已完成（2026-04-30）：**TM.2.A Visits 页面访问简化切片（ADR-0020 Tier 2.A）** —— SDK `pageViewPlugin`（硬刷新 + history patch，7 case 单测）；`page_view_raw` drizzle schema + DDL + migration 0008；`VisitsModule.VisitsService`（saveBatch + 4 聚合方法）；Gateway 分流；Dashboard `/dashboard/v1/visits/overview`；Web `/monitor/visits` live 页面（SummaryCards + TrendChart + TopPages + TopReferrers + 三态 SourceBadge）；demo 场景 `/visits/page-view`；server 单测 228/228 全绿 + sdk 97/97 全绿 + typecheck 8/8；推迟：GeoIP / page_duration / session_raw / UTM
- 已完成（2026-05-04）：**T1.1.7 认证与项目管理 MVP（ADR-0032）+ T1.1.8 CI 流水线全部完成** —— AuthModule（注册/登录/刷新/登出 + bcrypt + JWT 双 token + Refresh Redis）；JwtAuthGuard + ProjectGuard + RolesGuard + @Roles() 四角色 RBAC（owner/admin/member/viewer）；ProjectsService CRUD + 创建事务 4 表联写；MembersService 邀请/列表/角色更新/移除；TokensService API Token CRUD；DashboardModule 全量接入三层 Guard；Web `/login` + `/register` 页（shadcn Card + 预填测试账号 admin@example.com / admin123）+ middleware `/` → `/login` 重定向 + token 双写 localStorage + cookie；ESLint 9 flat config（覆盖 packages/sdk、shared + apps/server、web、ai-agent + examples/nextjs-demo）；GitHub Actions CI workflow（3 并行 job：lint-and-typecheck / test / build + PostgreSQL 16 + Redis 7 服务容器）；Turbo Remote Cache 配置（`turbo.json` + `TURBO_TOKEN` / `TURBO_TEAM`）；`docs/CI_SETUP.md` 配置文档；本地验证 370 测试用例全绿 + `pnpm turbo build --concurrency=2` 避免 Next.js worker 冲突；ADR-0032 提议 → 采纳；`apps/docs/docs/reference/auth.md` + demo 脚本；**Phase 1 M1.1 基础设施里程碑完整闭环**
- 已完成（2026-05-04）：**M1.5 Sourcemap 服务实装（ADR-0031，T1.5.1~T1.5.4 全部 `[x]`）** —— `release_artifacts` Drizzle schema + DDL + 迁移 0009（T1.5.1）；`S3StorageService`（put/get/delete/deletePrefix + MinIO 兼容 + bucket 自动创建，5 case 单测）；`ApiKeyGuard`（X-Api-Key → project_keys.secret_key 校验 + test env bypass）；`SourcemapController` 4 端点（POST releases 幂等 / POST artifacts multipart + UPSERT / GET artifacts / DELETE releases 级联，7 case 单测）；`@fastify/multipart` 50MB 限制注册（T1.5.2）；`SourcemapService.resolveFrames` 真实实现（source-map v0.7 WASM + LRU 100 条 TTL 1h + dispose 回收 + 逐 frame 降级不抛错，11 case 单测）（T1.5.3）；`SOURCEMAP_LRU_CAPACITY` env 新增；demo `upload-sourcemap.sh` curl 脚本（T1.5.4）；`apps/docs/docs/sdk/sourcemap.md` 全量重写（HTTP API + CI 示例 + 还原原理 + 排查表）+ `apps/docs/docs/reference/sourcemap.md` 新建（4 端点完整说明 + 鉴权 + 还原流程 + 错误码）；SPEC §9.2 `release_artifacts` 标记已建表；ARCHITECTURE §4.1.2 SourcemapService 从 stub 切换为已实现；ADR-0031 提议 → 采纳；server 312 单测 + 6 e2e + typecheck 全绿
- 阶段主题：**Phase 1 M1.1 基础设施 + M1.5 Sourcemap 完整闭环**（JWT 认证 + CI/CD + Sourcemap 还原三项基础设施全部就绪，Phase 1 核心任务完成）+ **菜单完整化 Tier 1~3 全部交付**（ADR-0020）
- 备选（不阻塞）：GeoIP 地域分布 + page_duration + session_raw 作为 TM.2.A 的增量迭代独立拆任务
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
