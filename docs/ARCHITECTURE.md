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
                            │ │ · ErrorProcessor ✅ · PerformanceProcessor ✅           │ │
                            │ │ · ApiProcessor ✅（切片）  · TrackProcessor ✅（切片）   │ │
                            │ │ · ResourceProcessor · VisitProcessor · CustomProcessor（规划）│ │
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
                              │  · Shadcn/ui · Apple HIG │    │  · 修复 Agent（沙箱 + Git PR） │
                              │  · @ant-design/plots 大盘│◀───│  回写 heal_job + 通知         │
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
| `DashboardModule` | 面向 Web 的只读聚合 API（首版 ADR-0015 性能大盘直查 `perf_events_raw` + p75；首版 ADR-0016/0019 异常大盘直查 `error_events_raw` 按 9 类目 `category` 聚合 + `(sub_type, message_head)` 字面排行；T1.1.7 后并入 JWT + ProjectGuard） | HTTP `/dashboard/v1/*` → Phase 6 迁移至 `/api/v1/*` | DB、PerformanceService、ErrorsService |
| `ErrorsModule` | 异常事件切片存储与聚合（ADR-0016 + ADR-0019）：`error_events_raw` 幂等落库（新增 Ajax/API code 列）+ 9 类目 `categoryCards` / `stackBuckets` / `ranking` / `dimensions` 聚合方法，供 GatewayService 与 DashboardModule 调用 | 进程内 Service | DB |
| `PerformanceModule` | 性能事件切片存储与聚合（ADR-0013）：`perf_events_raw` 落库 + p75 / 趋势 / 瀑布 / 慢页面 Top N 聚合 | 进程内 Service | DB |
| `ApiModule` | API 事件切片存储与聚合（ADR-0020 Tier 1；ADR-0025 后由 `api-monitor/` 更名为 `modules/api/`）：`api_events_raw` 幂等落库 + summary / trend / topSlow / topRequests / topPages / topErrorStatus / dimensions 聚合，供 GatewayService 与 DashboardModule 调用 | 进程内 Service | DB |
| `ResourcesModule` | 静态资源事件切片存储与聚合（ADR-0022 TM.1.B；ADR-0025 后由 `resource-monitor/` 更名为 `modules/resources/`）：`resource_events_raw` 幂等落库 + summary / categoryBuckets（6 类固定占位）/ trend / topSlow / topFailingHosts 聚合，供 GatewayService 与 DashboardModule 调用；与 apiPlugin/errorPlugin 的三链路互斥（排除 fetch/xhr/beacon） | 进程内 Service | DB |
| `TrackingModule` | 埋点事件切片存储与聚合（P0-3 + ADR-0024 曝光 + ADR-0027 漏斗）：`track_events_raw` 幂等落库 + summary / typeBuckets / trend / topEvents / topPages / 曝光切片 / **动态 N 步漏斗聚合（aggregateFunnel，2~8 步 CTE 逐步推进 + `stepWindowMs` 约束 + 用户级去重）**，覆盖 click / expose / submit / code 4 类事件，供 GatewayService 与 DashboardModule 调用 | 进程内 Service | DB |
| `CustomModule` | 自定义上报切片存储与聚合（ADR-0023 TM.1.C）：`custom_events_raw` / `custom_metrics_raw` 双表幂等落库 + CustomEventsService（event summary / top events / trend / top pages）+ CustomMetricsService（metric summary p75/p95 / per-name p50/p75/p95/avg / trend），供 GatewayService 与 DashboardModule 调用 | 进程内 Service | DB |
| `LogsModule` | 分级日志切片存储与聚合（ADR-0023 TM.1.C）：`custom_logs_raw` 幂等落库 + LogsService（summary / 3 级别固定占位 levelBuckets / 三折线 trend / top messages 按 (level, messageHead) 分组），供 GatewayService 与 DashboardModule 调用 | 进程内 Service | DB |
| `VisitsModule` | 页面访问事件切片存储与聚合（ADR-0020 Tier 2.A）：`page_view_raw` 幂等落库 + summary（PV/UV/SPA 占比/刷新占比）/ trend（按小时 PV·UV）/ topPages / topReferrers 聚合，供 GatewayService 与 DashboardModule 调用；地域 / 停留时长 / 会话聚合 / UTM 推迟 | 进程内 Service | DB |
| `OpenApiModule` | 面向外部系统的 API Token 开放接口 | HTTP `/open/v1/*` | DB |
| `HealModule` | 触发自愈流程，产出/回写 heal_job | HTTP + BullMQ `heal-jobs` | DB → ai-agent |
| `ProjectModule` | 项目/成员/环境/Release/Key 管理 | 被 Dashboard/Open 调用 | DB |
| `AuthModule` | 用户认证、JWT 签发、RBAC 守卫 | Guard + Service | DB、Redis |
| `SharedModule` | DB 连接、Redis、BullMQ 注册、对象存储、IP 库、日志 | 全局注入 | — |

### 3.2 模块内部结构示例

**入口层 vs 业务域层（ADR-0025）**：
`apps/server/src/` 按"入口边界"分两层：
- 入口层（顶层平铺）：`gateway/`（SDK 写链路唯一入口）、`dashboard/`（Web 读链路唯一入口，按 4 组菜单分级）、`health/`、其它入口（`sourcemap/` / `openapi/` / `heal/` 等）。
- 业务域层（`modules/` 子目录）：`errors/` / `performance/` / `api/` / `resources/` / `tracking/` / `custom/` / `logs/` 等纯领域服务；只通过 DI 被入口层消费，不直接对外暴露 HTTP。

```
apps/server/src/
├── gateway/                    # 入口层：SDK 写链路
│   ├── gateway.module.ts
│   ├── gateway.controller.ts   # /ingest 端点
│   ├── gateway.service.ts
│   ├── dto/ingest-batch.dto.ts
│   └── guards/dsn.guard.ts
├── dashboard/                  # 入口层：Web 读链路，按 web (console)/ 4 组菜单分级
│   ├── dashboard.module.ts
│   ├── dto/                    # 所有 Overview DTO（Zod Schema）
│   ├── monitor/                # errors / performance / api / resources / logs .{controller,service}
│   ├── tracking/               # tracking / exposure / custom .{controller,service}
│   └── settings/               # Tier 2+ 占位（projects / members / tokens / ...）
└── modules/                    # 业务域层（进程内 Service，无 HTTP 出口）
    ├── errors/      errors.service.ts
    ├── performance/ performance.service.ts
    ├── api/         api.service.ts
    ├── resources/   resources.service.ts
    ├── tracking/    tracking.service.ts
    ├── custom/      custom-events.service.ts · custom-metrics.service.ts
    └── logs/        logs.service.ts
```

**心智对称**：后端 `dashboard/{monitor,tracking,settings}/` ⟷ 前端 `apps/web/app/(console)/{dashboard,monitor,tracking,settings}/`。

### 3.3 通信规则

1. **外部 → 内部**：仅允许经过 `GatewayModule`（SDK 上报）和 `SourcemapModule`（上传）或 `DashboardModule`（面板）的 HTTP 入口。
2. **模块间同步调用**：通过 NestJS DI 注入 Service，不得直接 import 他模块的 Controller。
3. **模块间异步调用**：统一走 BullMQ 队列，队列名常量定义在 `packages/shared`。
4. **server → ai-agent**：只通过 BullMQ 队列（`ai-diagnosis` / `ai-heal-fix`）；ai-agent 完成后将结果写回 DB 或触发回调队列。
5. **数据库访问**：统一通过 `SharedModule` 提供的 Drizzle 客户端。
6. **缓存 key 前缀**：按模块划分命名空间，如 `gateway:ratelimit:<pid>`、`dashboard:cache:<key>`，禁止裸 key。

### 3.4 BullMQ 队列清单

| 队列名 | 生产者 | 消费者 | 状态 | 用途 |
|---|---|---|---|---|
| `events-error` | Gateway | Processor/Error | 🟢 已落地（ADR-0026 / TM.E）：BullMQ 消费 + Sourcemap stub + DLQ 桥接，MODE 开关 `ERROR_PROCESSOR_MODE=queue\|sync\|dual` | 异常事件 |
| `events-performance` | Gateway | Processor/Performance | 🟡 过渡期：Gateway 直调 PerformanceService；队列保留（T2.1.4 切换） | 性能事件（Web Vitals、navigation） |
| `events-api` | Gateway | Processor/Api | 🟡 过渡期：Gateway 直调 ApiService | API 请求事件（ADR-0020） |
| `events-resource` | Gateway | Processor/Resource | 🟡 过渡期：Gateway 直调 ResourcesService（ADR-0022 TM.1.B），队列保留 | 静态资源事件 |
| `events-visit` | Gateway | Processor/Visit | ⚪ 规划 | 页面访问 + 会话 |
| `events-custom` | Gateway | Processor/Custom | 🟡 过渡期：Gateway 直调 CustomEventsService + CustomMetricsService（ADR-0023 TM.1.C），队列保留 | 自定义事件 + 指标（`custom_event` / `custom_metric`） |
| `events-log` | Gateway | Processor/Logs | 🟡 过渡期：Gateway 直调 LogsService（ADR-0023 TM.1.C），队列保留 | 分级日志（`custom_log`） |
| `events-track` | Gateway | Processor/Track | 🟡 过渡期：Gateway 直调 TrackingService（P0-3 切片），队列保留 | 代码/全埋点/曝光（`track` 事件） |
| `alert-evaluator` | `AlertModule` 定时器 | Alert Evaluator | ⚪ 规划 | 告警规则评估 |
| `notifications` | Alert/Heal | Notification | ⚪ 规划 | 外部通知 |
| `ai-diagnosis` | HealModule | ai-agent | ⚪ 规划 | AI 诊断 |
| `ai-heal-fix` | ai-agent（自触发） | ai-agent | ⚪ 规划 | 生成 patch + 沙箱验证 + 创建 PR |
| `sourcemap-warmup` | ReleaseUpload | Sourcemap | ⚪ 规划 | 预热堆栈还原 |

**状态说明**：✅ 已落地 · 🟡 过渡期（队列已声明但首版走进程内直调，后续 Processor 完整化时切换） · ⚪ 规划中（队列名常量先于实现定义在 `packages/shared`）。

**重试策略**：默认 3 次指数退避；失败事件进入 `*-dlq` 死信队列，由 DLQ 模块监控告警。

---

## 4. 数据流

### 4.1 错误事件 → Issue

#### 4.1.1 当前实现（ADR-0026 / TM.E：BullMQ 异步 + Sourcemap stub）

```
SDK (errorPlugin, window.error 冒泡/捕获 + unhandledrejection)
  ├─ subType ∈ {js, promise, resource, framework, white_screen}
  ├─ WeakSet<Event> 去重（同一事件冒泡与捕获阶段不重复）
  └─ stack-parser.ts 纯函数解析 ≤ 20 帧

  ──POST /ingest/v1/events──▶ Gateway
      · Zod 校验 · DSN → projectId · 批量幂等（eventId UNIQUE）
      · 按 ERROR_PROCESSOR_MODE 分流：
        - queue（默认）：Queue('events-error').add() 后立即响应，persisted=0 / enqueued=N
        - sync         ：回滚路径，Gateway 进程内直调 ErrorsService.saveBatch()
        - dual         ：双写灰度比对
      · 响应体 `{ accepted, persisted, duplicates, enqueued }`（enqueued 仅增不改 SDK 契约）
      · Redis 故障 → 本进程自动降级 sync，并记 WARN 日志

BullMQ events-error ──▶ ErrorProcessor（concurrency=4, attempts=3 指数退避）
  · SourcemapService.resolveFrames(events) 还原（当前 stub；T1.5.3 实装）
  · ErrorsService.saveBatch() → error_events_raw UNIQUE · IssuesService.upsertBatch() · HLL pfadd
  · 失败耗尽 → @OnWorkerEvent('failed') → DeadLetterService(stage=error-raw-insert)

DashboardModule (ADR-0016)
  └─ GET /dashboard/v1/errors/overview（链路与实现不变）

Web /errors（链路与实现不变）
```

#### 4.1.2 目标实现（T1.5.3 Sourcemap 完整还原后）

```
SDK ──batch──▶ Gateway ──▶ BullMQ: events-error ──▶ ErrorProcessor
   · Sourcemap 还原堆栈（SourcemapService 真实实现：MinIO + source-map v0.7 + LRU）
   · 计算指纹 sha1(subType + normalizedMessage + topFrame) —— 已在 ErrorsService 内闭环
   · UPSERT issues（error_issues）+ INSERT events_raw —— 已在当前实现内闭环
   · 触发 alert-evaluator（实时告警场景）
```

### 4.2 性能事件 → 聚合指标

#### 4.2.1 当前实现（ADR-0013 / 0014 / 0015 / 0018）

```
SDK plugins（packages/sdk/src/plugins/）
  ├─ performancePlugin (web-vitals@^4)
  │    ├─ metric ∈ {LCP, FCP, CLS, INP, TTFB} 单事件单指标
  │    └─ Navigation 瀑布挂载在 TTFB 事件的 navigation 字段上
  ├─ longTaskPlugin (PerformanceObserver 'longtask', ≥50ms)
  │    └─ type='long_task' 事件，T2.1.8 扩展 tier ∈ {long_task, jank, unresponsive}
  ├─ speedIndexPlugin (FP/FCP/LCP 三里程碑梯形法 AUC)
  │    └─ metric='SI'，load + settleMs=3000 封板一次，±20% 精度
  ├─ fspPlugin (T2.1.8 落地)
  │    └─ MutationObserver + rAF 窗口 → metric='FSP' 首屏时间
  ├─ errorPlugin（ADR-0016 + ADR-0019）
  │    └─ window.error 冒泡/捕获 + unhandledrejection；category ∈
  │       {js, promise, white_screen, js_load, image_load, css_load, media}
  └─ httpPlugin（ADR-0019）
       └─ fetch / XHR monkey-patch；category ∈ {ajax, api_code}，
          默认跳过上报端点避免雪崩

  ──POST /ingest/v1/events──▶ Gateway
      · Zod 校验 · DSN → projectId · 批量幂等（eventId UNIQUE）
      · 分流：type='performance'/'long_task' → PerformanceService.saveBatch() → perf_events_raw（ADR-0013）
      ·       type='error' → ErrorService.saveBatch() → error_events_raw（ADR-0016）
      · 暂不入 BullMQ events-performance（过渡设计，T2.1.4 改造）

DashboardModule (ADR-0015 + ADR-0018)
  └─ GET /dashboard/v1/performance/overview
      · 并发 N 次查询：
        - aggregateVitals × 2（当前 / 环比，覆盖 LCP/FCP/CLS/INP/TTFB/FSP/FID/TTI/TBT/SI 共 10 指标）
        - aggregateTrend（按小时 × metric 的 p75 宽表，白名单含全部 10 指标）
        - aggregateWaterfallSamples（TTFB.navigation 样本中位数串成 9 阶段瀑布）
        - aggregateSlowPages（按 path Top-N LCP p75）
        - aggregateFmpPages（按 path FSP 平均 + within3sRatio）
        - aggregateDimensions（browser / os / platform 三维分布）
        - aggregateLongTasks（count/totalMs/p75Ms + 3 级 tier 拆分）
      · 直查 perf_events_raw，走 idx_perf_project_metric_ts / idx_perf_project_path_ts
      · 空数据返回占位结构（9 Vitals + 空 stages/trend/slowPages/fmpPages/dimensions + 0 longTasks），不报错

Web /performance
  · SSR force-dynamic + 三态 Badge（live / empty / error）
  · Core Vitals 九宫格（LCP/INP/CLS/TTFB/FCP/TTI/TBT/FID/SI）+ Deprecated Badge
  · 趋势图用 dayjs 本地时区格式化 UTC ISO
  · 顶栏时间选择器双向绑定 URL `?windowHours=` query（T2.1.8 落地）
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

物理目录、URL、菜单分组三者通过 `apps/web/lib/nav.ts` 单一事实源保持一致（见 ADR-0021）：

```
apps/web/app/
├── (auth)/                            # 登录、注册、忘记密码（规划）
├── (console)/                         # 管理后台根路由分组（4 级菜单聚合）
│   ├── dashboard/
│   │   ├── overview/                  # 数据总览（规划，Phase 6）
│   │   └── realtime/                  # 实时监控（规划）
│   ├── monitor/
│   │   ├── errors/                    # 异常分析 ✅ 首版
│   │   ├── performance/               # 页面性能（Web Vitals / 瀑布图） ✅ 首版
│   │   ├── api/                       # API 监控（summary / trend / topSlow） ✅ ADR-0020 Tier 1
│   │   ├── visits/                    # 页面访问 ✅ ADR-0020 Tier 2.A（pageViewPlugin + page_view_raw + summary/trend/topPages/topReferrers）
│   │   ├── resources/                 # 静态资源 ✅ ADR-0022 TM.1.B（resourcePlugin + resource_events_raw + 5 模块聚合）
│   │   └── logs/                      # 自定义日志 ✅ ADR-0023 TM.1.C（customPlugin.log + custom_logs_raw + 三级别聚合）
│   ├── tracking/
│   │   ├── events/                    # 事件分析 ✅ P0-3（click / expose / submit / code）
│   │   ├── exposure/                  # 曝光分析 ✅ ADR-0024（track_events_raw[track_type=expose] 聚合：总曝光/去重元素/去重页面/每用户曝光 + 小时趋势 + Top selector/Top page）
│   │   ├── funnel/                    # 漏斗分析（规划）
│   │   ├── retention/                 # 留存分析（规划）
│   │   └── custom/                    # 自定义上报 ✅ ADR-0023 TM.1.C（customPlugin.track/time + custom_events_raw + custom_metrics_raw + 事件/测速/Top 页面聚合）
│   ├── settings/
│   │   ├── projects/                  # 项目管理（规划）
│   │   ├── members/                   # 成员与权限（规划）
│   │   ├── channels/                  # 通知渠道（规划）
│   │   ├── alerts/                    # 告警规则（规划）
│   │   ├── sourcemaps/                # Sourcemap 上传记录（规划）
│   │   ├── tokens/                    # API Token（规划）
│   │   └── ai/                        # AI 自愈配置（规划）
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

| 层级 | 状态 | 允许依赖 | 禁止依赖 |
|---|---|---|---|
| `packages/shared` | ✅ | zod | nestjs / react / next / langchain / node 运行时副作用 |
| `packages/sdk` | ✅ | shared | 任何 Node.js API |
| `packages/miniapp-sdk` | ⚪ 规划 | shared | 浏览器 DOM API |
| `packages/cli` | ⚪ 规划 | shared | apps/* |
| `packages/vite-plugin` | ⚪ 规划 | shared | apps/* |
| `apps/server` | ✅ | shared, nestjs 生态, drizzle, bullmq, ioredis | apps/web, apps/ai-agent |
| `apps/web` | ✅ | shared, react / next 生态 | apps/server, apps/ai-agent, nestjs, bullmq |
| `apps/ai-agent` | ⚪ 规划 | shared, langchain, simple-git, octokit | apps/server, apps/web, nestjs, react |

**红线**：
- 禁止 `apps/*` 互相 import。
- 禁止 `packages/shared` 引入运行时副作用（副作用 import、全局修改）。
- 禁止绕过 `GatewayModule` 直接写 `events_raw`。

---

## 8. 基础设施

### 8.1 数据库

- **PostgreSQL 17** 主存；`events_raw` 按 `ingested_at` 周分区，热数据保留 30 天。
- **TimescaleDB 扩展（可选）**：未来迁移 `metric_minute` 为 hypertable；当前用原生分区 + 物化视图。
- **Redis 7**：BullMQ 队列、分布式限流令牌桶、Dashboard 查询缓存。
- **MinIO / S3**：Sourcemap、大字段原始事件、诊断 Markdown、patch diff。

#### 8.1.1 Schema 基线（ADR-0017）

**主表（8 张，前缀 nanoid 主键）**：
- `users` — 认证主体（usr_xxx）
- `projects` — 多租户根（proj_xxx），`slug` UNIQUE 作为 URL 友好键
- `project_keys` — DSN 鉴权键（pk_xxx），`public_key` partial index（`WHERE is_active=true`）
- `project_members` — 项目级 RBAC，复合主键 (project_id, user_id)
- `environments` — 项目环境，复合主键 (project_id, name)
- `releases` — 发布版本（rel_xxx），(project_id, version) UNIQUE
- `issues` — 异常聚合（iss_xxx），(project_id, fingerprint) UNIQUE；**本期仅建表不写入**（ADR-0016 分组仍走 `error_events_raw.message_head`，T1.4.2 指纹落地后切换）

**事件流表（9 张，bigserial 或复合主键）**：
- `perf_events_raw` — 性能切片（ADR-0013），PerformanceProcessor 直写，支撑性能大盘 p75 / 趋势 / 瀑布
- `error_events_raw` — 异常切片（ADR-0016 + ADR-0019），ErrorProcessor 直写，支撑 9 类目大盘与 `(sub_type, message_head)` 字面排行
- `api_events_raw` — API 切片（ADR-0020 Tier 1），ApiService 幂等落库，支撑 summary / trend / topSlow / topRequests / topPages / topErrorStatus / dimensions 聚合
- `track_events_raw` — 埋点切片（P0-3），TrackingService 幂等落库，支撑埋点大盘 summary / typeBuckets / trend / topEvents / topPages 聚合，覆盖 click / expose / submit / code 4 类事件
- `resource_events_raw` — 静态资源切片（ADR-0022 TM.1.B），ResourcesService 幂等落库，支撑资源大盘 summary / categoryBuckets（6 类固定）/ trend / topSlow / topFailingHosts 聚合；仅收 PerformanceResourceTiming 样本，明确排除 fetch/xhr/beacon
- `custom_events_raw` — 自定义业务埋点切片（ADR-0023 TM.1.C），CustomEventsService 幂等落库，支撑 `/tracking/custom` 大盘事件 Top / 趋势 / Top 页面聚合；customPlugin.track 主动上报
- `custom_metrics_raw` — 自定义业务测速切片（ADR-0023 TM.1.C），CustomMetricsService 幂等落库，支撑 `/tracking/custom` 大盘 p50/p75/p95 + avg 分位数聚合（`percentile_cont` per-name）；customPlugin.time 主动上报
- `custom_logs_raw` — 自定义分级日志切片（ADR-0023 TM.1.C），LogsService 幂等落库，支撑 `/monitor/logs` 大盘 info/warn/error 三级别固定占位 + 三折线趋势 + (level, messageHead) Top 消息聚合；customPlugin.log 主动上报
- `events_raw` — 通用归档父表，`PARTITION BY RANGE (ingested_at)` + 4 张周分区骨架（2026w17 ~ 2026w20）；**定位为 Tier 2 归档层**，当前 Gateway 不写入，待通用 Processor / 长期留存策略启用后再接入

**迁移管理（双路径）**：
- `src/shared/database/ddl.ts` 手写 `ALL_DDL` 幂等 `CREATE IF NOT EXISTS` —— dev / test 零配置
- `drizzle/0001_initial.sql` —— CI / production 执行 `pnpm db:migrate` 跑此文件
- 两条路径手工对齐，T1.1.8 CI 后加 diff 校验自动化
- `drizzle-kit` 0.30 CJS 加载器与 NodeNext `.js` 扩展不兼容 + 分区 DDL 不支持原生生成 → 迁移文件目前手写

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
