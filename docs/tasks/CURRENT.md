# 任务跟踪

> 最后更新: 2026-04-27

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
| 应用子目录 | `apps/server` `apps/web` `apps/ai-agent` 尚未初始化（仅占位） |
| 包子目录 | `packages/sdk` `packages/shared` `packages/cli` `packages/vite-plugin` 尚未初始化 |
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
- [ ] **T1.1.5** Drizzle Schema & 迁移基线（projects / project_keys / project_members / environments / releases / users / issues / events_raw 分区表）— 3d
- [ ] **T1.1.6** `apps/web` 初始化（Next.js App Router + TailwindCSS v4 + Shadcn/ui 基础组件）— 2d
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
- [ ] **T1.2.2** ErrorPlugin（`window.onerror` + `unhandledrejection` + 静态资源错误）— 3d
- [ ] **T1.2.3** Breadcrumb 收集（路由切换、点击、console、fetch/xhr 轨迹）— 2d
- [ ] **T1.2.4** 设备与页面上下文采集（ua-parser / viewport / network / page info）— 1d
- [ ] **T1.2.5** 上报传输层（beacon / fetch / image 自动协商 + 批量队列 + flushInterval）— 3d
- [ ] **T1.2.6** 失败重试 + IndexedDB 持久化兜底 — 2d
- [ ] **T1.2.7** 采样 + `beforeSend` + `ignoreErrors` + 敏感字段默认过滤 — 2d
- [ ] **T1.2.8** SDK 构建（Rollup + ESM/UMD + 类型声明 + 体积预算 < 15KB gzip）— 2d
- [ ] **T1.2.9** SDK 单测 + Playwright 真实浏览器集成测试 — 3d

### M1.3 Gateway 入口

- [ ] **T1.3.1** GatewayModule 骨架 + `/ingest/v1/events`、`/ingest/v1/beacon` 端点 — 2d
- [ ] **T1.3.2** DSN 鉴权 Guard + 项目缓存 — 2d
- [ ] **T1.3.3** 项目级限流（Redis 令牌桶 Lua）— 2d
- [ ] **T1.3.4** 事件 Zod 校验 Pipe + 批量分发到各队列 — 2d
- [ ] **T1.3.5** 幂等去重（eventId Redis SETNX）— 1d
- [ ] **T1.3.6** Gateway 压测基线（k6，目标 5000 events/s）— 2d

### M1.4 ProcessorModule：异常消费

- [ ] **T1.4.1** ErrorProcessor（消费 `events-error` → Issue UPSERT + events_raw 写入）— 3d
- [ ] **T1.4.2** 指纹计算（normalize message + top-frame + sha1） — 2d
- [ ] **T1.4.3** Issue 用户数 HLL 估算 + 分钟级批量回写 — 2d
- [ ] **T1.4.4** DLQ 死信队列 + 失败告警 — 1d

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

## Phase 2：性能 + API + 访问

**目标**：Web Vitals、页面加载瀑布图、API 监控、PV/UV/会话看板。

### M2.1 性能监控

- [ ] **T2.1.1** SDK PerformancePlugin（LCP/FCP/CLS/INP/TTFB + navigation 各阶段）— 4d
- [ ] **T2.1.2** 首屏时间（MutationObserver + rAF 窗口）— 2d
- [ ] **T2.1.3** 长任务 / 卡顿 / 无响应采集 — 2d
- [ ] **T2.1.4** PerformanceProcessor（events_raw + metric_minute 聚合 p50/p95/p99）— 3d
- [ ] **T2.1.5** Apdex 计算 cron — 1d
- [ ] **T2.1.6** 性能大盘 API（总览 / Web Vitals / Apdex / 瀑布图原始样本）— 3d
- [ ] **T2.1.7** web/performance 页面（核心指标卡 + 趋势图 + 分页面瀑布图 ECharts）— 5d

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

- 进行中：无
- 下一步：T1.1.5 Drizzle Schema 首版、T1.2.2 ErrorPlugin、T1.3.2 Gateway 接入 BullMQ
- 最近完成（2026-04-27）：T1.1.3 `apps/server` 初始化（ADR-0011，NestJS 10 + Fastify 4 + ZodValidationPipe，5 用例单测/e2e 全绿，端到端 demo → server `accepted=1` 打通）
- 最近完成（2026-04-27）：T1.2.1 SDK 骨架 + examples/nextjs-demo（ADR-0010，44 项单测全绿，SDK 体积 2.73KB gzip）
- 最近完成（2026-04-27）：T1.1.4 落地 ADR-0009，`packages/shared` 产出 Env/Queues/Events 三部分，25 项单测全绿
- 阻塞：无
- 最近文档审查（2026-04-27）：完成 SPEC/ARCHITECTURE/DESIGN/CURRENT 对 `docs/PRD.md` v2 的对齐；补全 Breadcrumb Schema、navigation 阶段、UTM、p90、Apdex T 可配置、预置告警规则、批量导出、短信渠道与可视化埋点范围决策
