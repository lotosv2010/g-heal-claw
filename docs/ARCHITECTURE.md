# g-heal-claw 系统架构文档

> 版本: 2.0.0 | 日期: 2026-04-27
>
> **文档层级：PRD（什么）→ SPEC（契约）→ ARCHITECTURE（拓扑）→ DESIGN（为什么）**

---

## 1. 架构总览

g-heal-claw 采用 **模块化单体 NestJS 后端 + Next.js 前端 + 独立 LangChain AI Agent** 三应用架构。

**设计原则**：
- **逻辑边界清晰，物理部署简单** — NestJS 模块承担旧架构中微服务的角色，共享进程避免跨服务 HTTP 与分布式事务。
- **入口与消费解耦** — 高吞吐 SDK 上报通过 BullMQ 队列与重业务逻辑解耦。
- **AI 能力独立进程** — AI Agent 独立部署，资源与可用性不影响主站。

```
┌─────────────────┐  HTTPS   ┌───────────────────────────────────────────────────────────┐
│ 用户应用         │ ───────▶│              apps/server (NestJS, Fastify)                  │
│ · Web / H5       │         │                                                             │
│ · 小程序          │         │ ┌───────────────┐        ┌────────────────────────────────┐│
│ · 内嵌 SDK        │         │ │ GatewayModule │───────▶│ BullMQ: events-error /         ││
└─────────────────┘         │ └───────┬───────┘        │        events-performance /    ││
                            │         │                │        events-api / -resource/ ││
                            │         │                │        events-visit / -custom /││
                            │         │                │        events-track            ││
                            │         ▼                └────────────────┬───────────────┘│
                            │ ┌───────────────────────────────────────────┴────────────┐ │
                            │ │ ProcessorModule                                         │ │
                            │ │ · ErrorProcessor    · PerformanceProcessor             │ │
                            │ │ · ApiProcessor      · ResourceProcessor                │ │
                            │ │ · VisitProcessor    · CustomProcessor · TrackProcessor │ │
                            │ └──────────┬─────────────────────────────┬────────────────┘ │
                            │            │ metrics / issues              │ realtime feed   │
                            │            ▼                              ▼                 │
                            │ ┌──────────────┐ ┌───────────────┐ ┌─────────────────────┐  │
                            │ │ SourcemapMod │ │  AlertModule  │ │ RealtimeModule       │  │
                            │ │ (HTTP + Svc) │ │ (cron 评估)    │ │ (Redis Pub/Sub → SSE)│  │
                            │ └──────┬───────┘ └───────┬───────┘ └──────────┬───────────┘  │
                            │        │                 │ notifications      │ SSE          │
                            │        │                 ▼                    │              │
                            │        │         ┌────────────────────┐       │              │
                            │        │         │ NotificationModule │       │              │
                            │        │         │ (邮件/钉钉/企微/   │       │              │
                            │        │         │  Slack/Webhook/SMS) │       │              │
                            │        │         └──────┬─────────────┘       │              │
                            │        │                │ BullMQ              │              │
                            │        │                ▼ ai-diagnosis        │              │
                            │ ┌──────┴────────┐ ┌───────────────┐          │              │
                            │ │ HealModule    │─▶│ (跨进程队列)  │          │              │
                            │ │ (触发自愈)     │ └───────┬───────┘          │              │
                            │ └───────────────┘         │                  │              │
                            │ ┌───────────────────────────────────────────────────────────┐│
                            │ │ DashboardModule (REST + JWT) · OpenApiModule (API Token)  ││
                            │ │ AuthModule · ProjectModule · SharedModule(DB/Redis/Storage)││
                            │ └───────────────────────────────────────────────────────────┘│
                            └──────────────┬──────────────────────────────┬────────────────┘
                                           │ HTTP (SSR) + SSE              │ BullMQ
                                           ▼                               ▼
                              ┌────────────────────────┐    ┌──────────────────────────────┐
                              │  apps/web (Next.js)     │    │ apps/ai-agent (LangChain)    │
                              │  · App Router SSR       │    │  · 诊断 Agent                 │
                              │  · Shadcn/ui            │    │  · 修复 Agent（沙箱 + Git PR） │
                              │  · ECharts 大盘 / 实时   │◀───│  回写 heal_job + 通知         │
                              └────────────────────────┘    └──────────────────────────────┘

基础设施：PostgreSQL 17 · Redis 7 · MinIO / S3 · Docker Compose（本地）/ K8s（生产）
```

---

## 2. 应用边界

| 应用 | 框架 | 职责 | 部署形态 |
|---|---|---|---|
| `apps/server` | NestJS (Fastify) | 全部后端逻辑（入口 + 消费 + 查询 + 告警） | 单镜像多实例，Worker 可独立启动 |
| `apps/web` | Next.js (App Router) | 管理面板 SSR 前端 | 独立镜像，对接 `apps/server` API |
| `apps/ai-agent` | LangChain + Node.js | AI 诊断、修复生成、Git 操作 | 独立镜像，消费 BullMQ 任务 |

**禁止 apps 之间直接引用代码**，只能通过 `packages/shared` 共享类型 / Zod Schema / 队列名常量，通过 BullMQ 队列异步通信。

---

## 3. 后端模块拓扑（apps/server）

### 3.1 模块清单

| 模块 | 职责 | 对外暴露 | 依赖 |
|---|---|---|---|
| `GatewayModule` | SDK 入口：DSN 鉴权、Schema 校验、限流、入队 | HTTP `/ingest/*` | BullMQ queues、Redis |
| `ProcessorModule` | 消费事件、计算指纹、聚合 Issue/指标 | BullMQ Workers | DB、Sourcemap、BullMQ |
| `SourcemapModule` | Sourcemap 上传/查询/堆栈还原 | HTTP `/sourcemap/*` + Service | Storage、Redis cache |
| `AlertModule` | 告警规则评估、触发 | BullMQ `alert-evaluator` | DB、Notification |
| `NotificationModule` | 通知渠道分发（邮件/钉钉/企微/Slack/Webhook/**短信**） | BullMQ `notifications` | 外部 HTTP / SMS Provider |
| `RealtimeModule` | 将聚合事件通过 Redis Pub/Sub 扇出，向前端推送 SSE | HTTP `/api/v1/stream/*` · `/open/v1/events/stream` | Redis Pub/Sub |
| `DashboardModule` | 面向 Web 的只读聚合 API（首版 ADR-0015：性能大盘直查 `perf_events_raw` + p75；T1.1.7 后并入 JWT + ProjectGuard） | HTTP `/dashboard/v1/*` → Phase 6 迁移至 `/api/v1/*` | DB、PerformanceService |
| `OpenApiModule` | 面向外部系统的 API Token 开放接口 | HTTP `/open/v1/*` | DB |
| `HealModule` | 触发自愈流程，产出/回写 heal_job | HTTP + BullMQ `heal-jobs` | DB → ai-agent |
| `ProjectModule` | 项目/成员/环境/Release/Key 管理 | 被 Dashboard/Open 调用 | DB |
| `AuthModule` | 用户认证、JWT 签发、RBAC 守卫 | Guard + Service | DB、Redis |
| `SharedModule` | DB 连接、Redis、BullMQ 注册、对象存储、IP 库、日志 | 全局注入 | — |

### 3.2 模块内部结构示例

```
apps/server/src/gateway/
├── gateway.module.ts
├── gateway.controller.ts        # /ingest 端点
├── gateway.service.ts           # DSN 解析 + 限流 + 入队
├── dto/
│   └── ingest-batch.dto.ts      # Zod Schema + z.infer 类型
└── guards/
    └── dsn.guard.ts             # DSN publicKey → projectId 解析
```

### 3.3 通信规则

1. **外部 → 内部**：仅允许经过 `GatewayModule`（SDK 上报）和 `SourcemapModule`（上传）或 `DashboardModule`（面板）的 HTTP 入口。
2. **模块间同步调用**：通过 NestJS DI 注入 Service，不得直接 import 他模块的 Controller。
3. **模块间异步调用**：统一走 BullMQ 队列，队列名常量定义在 `packages/shared`。
4. **server → ai-agent**：只通过 BullMQ 队列（`ai-diagnosis` / `ai-heal-fix`）；ai-agent 完成后将结果写回 DB 或触发回调队列。
5. **数据库访问**：统一通过 `SharedModule` 提供的 Drizzle 客户端。
6. **缓存 key 前缀**：按模块划分命名空间，如 `gateway:ratelimit:<pid>`、`dashboard:cache:<key>`，禁止裸 key。

### 3.4 BullMQ 队列清单

| 队列名 | 生产者 | 消费者 | 用途 |
|---|---|---|---|
| `events-error` | Gateway | Processor/Error | 异常事件 |
| `events-performance` | Gateway | Processor/Performance | 性能事件（Web Vitals、navigation） |
| `events-api` | Gateway | Processor/Api | API 请求事件 |
| `events-resource` | Gateway | Processor/Resource | 静态资源事件 |
| `events-visit` | Gateway | Processor/Visit | 页面访问 + 会话 |
| `events-custom` | Gateway | Processor/Custom | 自定义事件 / 指标 / 日志（`custom_event`、`custom_metric`、`custom_log`） |
| `events-track` | Gateway | Processor/Track | 代码/全埋点/曝光/停留时长（`track` 事件） |
| `alert-evaluator` | `AlertModule` 定时器 | Alert Evaluator | 告警规则评估 |
| `notifications` | Alert/Heal | Notification | 外部通知 |
| `ai-diagnosis` | HealModule | ai-agent | AI 诊断 |
| `ai-heal-fix` | ai-agent（自触发） | ai-agent | 生成 patch + 沙箱验证 + 创建 PR |
| `sourcemap-warmup` | ReleaseUpload | Sourcemap | 预热堆栈还原 |

**重试策略**：默认 3 次指数退避；失败事件进入 `*-dlq` 死信队列，由监控告警通知。

---

## 4. 数据流

### 4.1 错误事件 → Issue

```
SDK ──POST /ingest/v1/events──▶ Gateway
    · DSN 鉴权 · Zod 校验 · 项目限流 · 服务端采样
    └── BullMQ: events-error ──▶ ErrorProcessor
                                  · Sourcemap 还原堆栈（SourcemapService）
                                  · 计算指纹
                                  · UPSERT issues + INSERT events_raw
                                  · 触发 alert-evaluator（实时告警场景）
```

### 4.2 性能事件 → 聚合指标

#### 4.2.1 当前实现（ADR-0013 / 0014 / 0015）

```
SDK (PerformancePlugin, web-vitals + Navigation)
  ├─ metric ∈ {LCP, FCP, CLS, INP, TTFB} 单事件单指标
  └─ Navigation 瀑布挂载在 TTFB 事件的 navigation 字段上

  ──POST /ingest/v1/events──▶ Gateway
      · Zod 校验 · DSN → projectId · 批量幂等（eventId UNIQUE）
      · 直调 PerformanceService.saveBatch() → perf_events_raw（ADR-0013）
      · 暂不入 BullMQ events-performance（过渡设计）

DashboardModule (ADR-0015)
  └─ GET /dashboard/v1/performance/overview
      · 并发 5 次查询：Vitals p75 当前 / 环比 / 24h 趋势 / 瀑布样本中位数 / 慢页面 Top N
      · 直查 perf_events_raw，走 idx_perf_project_metric_ts / idx_perf_project_path_ts
      · 空数据返回 5 张 Vitals 占位卡（sampleCount=0），不报错

Web /performance
  · SSR force-dynamic + 三态 Badge（live / empty / error）
  · 趋势图用 dayjs 本地时区格式化 UTC ISO
```

#### 4.2.2 目标实现（T2.1.4 之后）

```
SDK ──batch──▶ Gateway ──▶ BullMQ: events-performance ──▶ PerformanceProcessor
   · 落库 perf_events_raw · 增量聚合 metric_minute（p50/p75/p90/p95/p99/count/sum）
   · 触发 Apdex 计算（每分钟一次 cron）
   · DashboardModule 查询源切换至 metric_minute（Controller 契约不变）
```

### 4.3 实时推送链路

```
Processor 写入 metric/issue 时 ──▶ Redis PUBLISH channel=`rt:<projectId>:<topic>`
RealtimeModule (server) ── SUBSCRIBE ──▶ 维护订阅客户端 Map
  ├─ SSE: /api/v1/stream/overview    (JWT 鉴权，推送聚合大盘变更)
  ├─ SSE: /api/v1/stream/issues      (实时新增 Issue)
  ├─ SSE: /api/v1/stream/heal/:jobId (heal_job 阶段变更)
  └─ SSE: /open/v1/events/stream     (外部 API Token，事件级别推送，带采样)
```

- 订阅客户端在 Redis Key `rt:subs:<projectId>` 以 Set 维护，多 server 实例之间通过 Pub/Sub 自然去中心化。
- 每个 channel 具备独立的消息速率限制（默认 50 msg/s/连接），超限采样丢弃并在 SSE `event: overflow` 告知。
- 浏览器端断连自动重连，后端通过 `Last-Event-ID` 实现最近 60s 补推。

### 4.4 自愈流程

```
User 点击「一键自愈」 ──POST /heal/issues/:id──▶ HealModule
   · 创建 heal_job（status=pending）
   · BullMQ: ai-diagnosis ──▶ ai-agent
                              · 加载 Issue + Sourcemap + 仓库上下文
                              · LangChain Agent 多步推理（ReAct）
                              · 输出诊断 Markdown（status=patching）
                              · 生成 diff patch（status=verifying）
                              · Docker 沙箱运行 verify 命令
                              · GitHub/GitLab API 创建 PR（status=pr_created）
   · 回写 heal_job + 触发 NotificationModule
```

---

## 5. 前端架构（apps/web）

### 5.1 路由结构（App Router）

```
apps/web/app/
├── (auth)/                      # 登录、注册、忘记密码
├── (dashboard)/
│   ├── projects/                # 项目切换与管理
│   ├── overview/                # 总览仪表盘（核心指标卡 + 趋势）
│   ├── performance/             # 性能分析（Web Vitals / 瀑布图 / Apdex）
│   ├── errors/                  # 异常 Issue 列表与详情
│   ├── api/                     # API 监控
│   ├── resources/               # 静态资源分析
│   ├── visits/                  # 访问分析（PV/UV/会话）
│   ├── custom/                  # 自定义事件/日志/埋点分析
│   ├── alerts/                  # 告警规则与历史
│   ├── heal/                    # 自愈任务中心
│   ├── settings/                # 项目/成员/环境/通知渠道/Token
│   └── layout.tsx
└── layout.tsx
```

### 5.2 数据获取

- 服务端组件（RSC）默认 SSR 读数据，使用 `fetch` 命中 `apps/server` 的 `/api/v1/*`。
- 客户端交互组件使用 `@tanstack/react-query` + `fetch`，统一 API Client 封装 JWT。
- 实时数据（告警/heal 进度）通过 SSE 订阅 `/api/v1/stream/*`。

### 5.3 UI 体系

- Shadcn/ui + TailwindCSS v4（零配置主题）。
- 图表：**`@ant-design/plots`**（AntV G2）先落地性能大盘趋势图（T2.1.6）；ECharts 作为重度定制保留选项（T2.1.7 评估）。
- 时间格式化：**dayjs**（UTC ISO → 浏览器本地时区），所有图表 x 轴统一使用 `dayjs(iso).format('HH:00')`。
- 深色 / 浅色主题跟随系统。

---

## 6. AI Agent（apps/ai-agent）

### 6.1 功能边界

- 消费 `ai-diagnosis`、`ai-heal-fix` 队列任务。
- 与 Git 平台（GitHub、GitLab）交互，通过 Personal Access Token / GitHub App。
- 与 Docker 沙箱交互，运行 `heal.verify` 命令。
- 通过 LangChain Agent 执行多步 ReAct 推理。

### 6.2 Agent 工具（Tools）

| Tool | 说明 |
|---|---|
| `readIssue(issueId)` | 获取 Issue 详情 + 代表事件 + 堆栈 |
| `resolveStack(stackId)` | 调用 server SourcemapService 还原堆栈 |
| `readFile(repoPath)` | 读取仓库文件（受 `heal.paths` 白名单限制） |
| `grepRepo(pattern)` | 仓库内 ripgrep |
| `writePatch(diff)` | 产出 patch，写入 heal_job |
| `runSandbox(cmd)` | 在 Docker 沙箱执行 verify 命令 |
| `createPr(title, body, branch)` | 通过 Git 平台 API 创建 PR |

### 6.3 安全边界

- 模型访问通过独立密钥；可配置主备模型（Claude Opus 4.7 主，GPT-4.x 备）。
- 所有 Tool 调用记录到 `heal_job.trace`（审计）。
- 沙箱镜像不联网（除 npm registry mirror），修改仅限 `heal.paths`。
- 单次任务 LOC 超过 `heal.maxLoc` 直接失败，防止 AI 大改动。

---

## 7. 包依赖规则

| 层级 | 允许依赖 | 禁止依赖 |
|---|---|---|
| `packages/shared` | zod | nestjs / react / next / langchain / node 运行时副作用 |
| `packages/sdk` | shared | 任何 Node.js API |
| `packages/miniapp-sdk` | shared | 浏览器 DOM API |
| `packages/cli` | shared | apps/* |
| `packages/vite-plugin` | shared | apps/* |
| `apps/server` | shared, nestjs 生态, drizzle, bullmq, ioredis | apps/web, apps/ai-agent |
| `apps/web` | shared, react / next 生态 | apps/server, apps/ai-agent, nestjs, bullmq |
| `apps/ai-agent` | shared, langchain, simple-git, octokit | apps/server, apps/web, nestjs, react |

**红线**：
- 禁止 `apps/*` 互相 import。
- 禁止 `packages/shared` 引入运行时副作用（副作用 import、全局修改）。
- 禁止绕过 `GatewayModule` 直接写 `events_raw`。

---

## 8. 基础设施

### 8.1 数据库

- **PostgreSQL 17** 主存；`events_raw` 按周分区，热数据保留 30 天。
- **TimescaleDB 扩展（可选）**：未来迁移 `metric_minute` 为 hypertable；当前用原生分区 + 物化视图。
- **Redis 7**：BullMQ 队列、分布式限流令牌桶、Dashboard 查询缓存。
- **MinIO / S3**：Sourcemap、大字段原始事件、诊断 Markdown、patch diff。

### 8.2 可观测自举

- 后端日志：Pino，结构化 JSON，按 `requestId` 关联。
- Prometheus 指标：`/metrics` 暴露 Gateway 吞吐、队列长度、DB 连接池、Redis RT。
- 追踪：OpenTelemetry + OTLP（可选，通过环境变量开启）。
- 自己也可以做自己的用户：`apps/web` 内嵌自家 SDK（dogfooding）。

### 8.3 部署

- **本地开发**：`docker compose up`（PostgreSQL + Redis + MinIO） + `pnpm dev`。
- **生产**：Kubernetes 部署三个 Deployment（server / web / ai-agent），共享 Redis / PG / S3；Gateway 与 Worker 通过不同启动参数区分（同一镜像）。
- **CI/CD**：Turborepo 增量构建，GitHub Actions 触发镜像构建 + K8s 发布。

---

## 9. 新增模块检查清单

### 9.1 新增 NestJS 模块（apps/server）

1. 目录结构：`apps/server/src/<name>/<name>.module.ts` + controller / service / dto / processor。
2. 在 `AppModule` 中注册。
3. HTTP 端点必须含 `@ApiTags` + `@ApiOperation` + Zod 校验 Pipe。
4. BullMQ 队列名在 `packages/shared` 常量文件中定义。
5. 更新本文件 §3.1 模块清单 与 §3.4 队列清单（若新增队列）。

### 9.2 新增 packages

1. `src/index.ts` 作为唯一公开导出入口。
2. `package.json` 配置 `exports` 字段，ESM + 类型声明。
3. Vite Library Mode 构建。
4. 零副作用（SDK / CLI 入口除外）。
5. 更新 §7 依赖规则表。

### 9.3 新增事件子类型

1. 在 `packages/shared` 增加 Zod Schema 与 `type` 枚举。
2. Gateway 增加对应队列路由。
3. Processor 实现对应 Worker。
4. 更新 `SPEC.md` §4.2 事件子类型表、本文件 §3.4 队列清单。

---

## 10. 架构演进路线

| 阶段 | 触发条件 | 行动 |
|---|---|---|
| P0 | MVP | 当前模块化单体足矣，侧重 SDK + Gateway + Issue 聚合 + Dashboard |
| P1 | 单库超过 2TB 或 Gateway 单节点吞吐 > 10k events/s | 引入 Kafka 替换 BullMQ，Gateway 与 Processor 独立镜像 |
| P2 | 指标查询 P95 > 3s | 引入 ClickHouse，将 `metric_minute` 冷链路迁移过去 |
| P3 | 接入多云 + 数据驻留 | 按 region 分库，跨 region 只同步元数据 |

保持当前架构**不过度设计**，到了阈值再切换，避免早期复杂度拖慢交付。
