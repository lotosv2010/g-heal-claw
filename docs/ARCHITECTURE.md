# g-heal-claw 系统架构文档

> 版本: 1.0.0 | 日期: 2026-04-22

---

## 1. 架构总览

g-heal-claw 采用**模块化单体 + 独立 AI Agent** 的架构模式。后端以 NestJS 模块划分逻辑边界，前端使用 Next.js SSR，AI 能力通过 LangChain Agent 独立部署。

**架构原则**：逻辑边界清晰，物理部署简单。NestJS 模块 ≈ 旧设计中的微服务边界，但共享同一进程，消除服务间 HTTP 调用和分布式事务复杂度。

```
┌──────────────┐     HTTPS      ┌──────────────────────────────────────┐
│   用户应用    │ ─────────────> │           apps/server (NestJS)       │
│  (内嵌 SDK)   │               │  ┌──────────┐ ┌──────────────────┐  │
└──────────────┘               │  │ Gateway   │ │ Error Processor  │  │
                                │  │ Module    │ │ Module           │  │
                                │  └────┬─────┘ └────────┬─────────┘  │
                                │       │    BullMQ       │            │
                                │       └────────>────────┘            │
                                │  ┌──────────┐ ┌──────────────────┐  │
                                │  │ Sourcemap│ │ Notification     │  │
                                │  │ Module   │ │ Module           │  │
                                │  └──────────┘ └──────────────────┘  │
                                │  ┌──────────────────┐               │
                                │  │ Dashboard API     │               │
                                │  │ Module (REST/JWT) │               │
                                │  └──────────────────┘               │
                                └──────────────────────────────────────┘
                                         │ BullMQ            │ HTTP
                                         v                   v
                                ┌──────────────────┐ ┌──────────────┐
                                │  apps/ai-agent   │ │  apps/web    │
                                │  (LangChain)     │ │  (Next.js)   │
                                │  诊断 + 自动修复  │ │  SSR 管理面板 │
                                └──────────────────┘ └──────────────┘
```

---

## 2. 应用拓扑

### 2.1 应用清单

| 应用 | 框架 | 端口 | 职责 |
|---|---|---|---|
| `apps/server` | NestJS (Fastify adapter) | 3000 | 全部后端逻辑：采集、处理、存储、通知、REST API |
| `apps/web` | Next.js (App Router) | 3001 | 管理面板：SSR 页面、认证、数据可视化 |
| `apps/ai-agent` | LangChain + Node.js | 3002 | AI 诊断、修复生成、Git 操作、沙箱验证 |

### 2.2 NestJS 模块划分（apps/server）

每个模块对应旧设计中的一个独立服务，保持逻辑边界清晰：

| 模块 | 职责 | 对外暴露 |
|---|---|---|
| `GatewayModule` | SDK 事件接收、DSN 认证、限流、入队 | `POST /api/v1/events` |
| `ProcessorModule` | 事件消费（BullMQ Worker）、指纹计算、Issue 聚合、严重等级分类 | 无（队列消费） |
| `SourcemapModule` | Sourcemap 上传/存储/堆栈解析 | `POST /api/v1/sourcemaps`、`POST /api/v1/resolve` |
| `NotificationModule` | 通知规则引擎、多渠道分发（邮件/Slack/钉钉/Webhook） | 无（队列消费）|
| `DashboardModule` | 项目/Issue/事件/用户 CRUD、JWT 认证 | `REST /api/v1/*` |
| `SharedModule` | 数据库连接、Redis、BullMQ 注册、通用 Guard/Pipe/Filter | 全局注入 |

**模块间通信规则**：
- 模块间通过 **NestJS 依赖注入** 共享 Service（同进程内调用）
- 异步任务通过 **BullMQ 队列** 解耦（Gateway → Processor → AI Agent）
- 禁止模块间直接导入 Controller，只允许导入 Service

### 2.3 服务间通信

```
SDK ──HTTP──> server/GatewayModule ──BullMQ──> server/ProcessorModule
                                                    │ (进程内调用)
                                                    ├──> server/SourcemapModule
                                                    │ (BullMQ)
                                                    ├──> server/NotificationModule
                                                    └──> ai-agent (独立进程)

web (Next.js) ──HTTP──> server/DashboardModule ──SQL──> PostgreSQL
```

**通信协议**：
- SDK → Server: HTTPS + JSON
- Server 模块间: 进程内依赖注入（同步）或 BullMQ（异步）
- Server → AI Agent: BullMQ 队列（`ai-diagnosis`、`auto-fix`）
- Web → Server: HTTP + JSON（Next.js Server Actions / API Route → NestJS REST）
- 数据持久化: PostgreSQL（Drizzle ORM）
- 文件存储: MinIO/S3
- 缓存: Redis

---

## 3. 数据流

### 3.1 错误采集流程

```
1. 用户应用发生错误
2. SDK 捕获错误 → 收集上下文 + 面包屑 → 批量缓冲
3. SDK 发送 POST /api/v1/events → server/GatewayModule
4. GatewayModule 验证 DSN → Zod 校验载荷 → 检查限流
5. GatewayModule 将事件推入 BullMQ "error-events" 队列 → 返回 202
6. server/ProcessorModule 消费事件：
   a. 调用 SourcemapModule.resolve() 解析堆栈（进程内）
   b. 计算指纹（SHA256）
   c. 匹配已有 Issue（指纹去重）或创建新 Issue
   d. 分类严重等级
7. 若为新 Issue 或回归 Issue：
   a. 推入 "ai-diagnosis" 队列 → ai-agent
   b. 推入 "notification" 队列 → server/NotificationModule
```

### 3.2 AI 诊断流程（LangChain ReAct Agent）

```
1. ai-agent 从 "ai-diagnosis" 队列消费任务
2. 检查 prompt_hash 去重（同一 Issue 1小时内不重复）
3. 检查项目月度 token 预算
4. LangChain Agent 启动 ReAct 循环：
   a. Tool: read_source — 从 Sourcemap 获取源码上下文
   b. Tool: read_breadcrumbs — 获取面包屑和上下文
   c. Tool: search_similar — 搜索历史相似 Issue 的诊断
   d. 思考 → 生成诊断 Markdown（根因 + 方案 + 代码建议）
5. 存储 AIDiagnosis 记录
6. 若包含代码建议 → 推入 "auto-fix" 队列
```

### 3.3 自动修复流程（LangChain Agent + Tools）

```
1. ai-agent 从 "auto-fix" 队列消费任务
2. LangChain Agent 启动修复流程：
   a. Tool: git_clone — 浅克隆仓库（release tag）
   b. Tool: apply_patch — 应用 unified diff 补丁
   c. Tool: run_sandbox — 在沙箱中运行验证（lint + tsc）
   d. Tool: create_pr — 创建分支 + 提交 + PR
3. 验证失败 → Agent 可自动调整补丁并重试（最多 3 轮）
4. PR 创建后推送通知给项目 Owner
5. Owner 在 Dashboard 审批
6. 审批通过 → 合并 PR → 触发 CI/CD 流水线
7. 部署成功 → Issue 状态更新为 "auto_fixed"
```

### 3.4 Sourcemap 上传流程

```
1. 用户构建项目（vite build 等）
2. 构建插件自动调用或用户手动执行 CLI:
   npx @g-heal-claw/cli upload-sourcemaps --release X --path ./dist
3. CLI 扫描 *.map 文件 → 逐个 POST /api/v1/sourcemaps
4. server/SourcemapModule 存储到 MinIO/S3
5. 可选：构建后删除本地 .map 文件（防止暴露源码）
```

---

## 4. 基础设施

### 4.1 存储层

| 组件 | 技术 | 用途 | 持久化 |
|---|---|---|---|
| 主数据库 | PostgreSQL 17 | 全部结构化数据（用户、项目、Issue、诊断等） | Volume 持久化 |
| 缓存 | Redis 7 | 限流计数器、指纹去重、Sourcemap 解析缓存、Session | Volume 持久化 |
| 消息队列 | Redis + BullMQ | 事件队列、诊断队列、通知队列、修复队列 | Redis 持久化 |
| 对象存储 | MinIO (开发) / S3 (生产) | Sourcemap 文件 | Volume/S3 |
| 分析数据库 | ClickHouse (Phase 4) | 大规模事件聚合查询 | Volume 持久化 |

### 4.2 队列设计

| 队列名 | 生产者 | 消费者 | 并发 | 重试 |
|---|---|---|---|---|
| `error-events` | GatewayModule | ProcessorModule | 按项目并行 | 3 次，指数退避 |
| `ai-diagnosis` | ProcessorModule | ai-agent | 1（LLM API 限流） | 2 次 |
| `notification` | ProcessorModule / ai-agent | NotificationModule | 5 | 3 次 |
| `auto-fix` | ai-agent | ai-agent | 1（Git 操作） | 1 次 |

### 4.3 本地开发环境（Docker Compose）

```yaml
服务:
  - postgres:17-alpine  (端口 5432)
  - redis:7-alpine      (端口 6379)
  - minio               (端口 9000 API / 9001 Console)
  - minio-init          (初始化创建 sourcemaps bucket)
```

应用服务在宿主机上以 `pnpm dev` 运行，通过 localhost 连接基础设施容器。

### 4.4 生产部署拓扑

```
                     ┌─── CDN (Next.js 静态资源)
                     │
用户 ──> 负载均衡 ──┼─── apps/server 集群 (水平扩展)
                     │
                     └─── apps/web 集群 (Next.js SSR)

内部网络:
  apps/server 集群    ──> PostgreSQL (主从)
  apps/ai-agent       ──> Redis Cluster
                      ──> MinIO/S3
```

**扩展说明**: 当单体 server 达到瓶颈时，NestJS 模块可按需拆分为独立部署的微服务（模块边界已内置），无需重写代码。

---

## 5. 安全架构

### 5.1 认证层次

| 场景 | 认证方式 |
|---|---|
| SDK → server/GatewayModule | DSN (publicKey) 通过 `X-GHC-Auth` 头 |
| CLI → server/SourcemapModule | API Key 通过 `Authorization: Bearer` |
| 用户 → web (Next.js) | NextAuth.js 或 JWT + Refresh Token |
| web → server/DashboardModule | JWT（Server-side 调用） |
| ai-agent → Git Provider | OAuth / Personal Access Token |

### 5.2 数据安全

- **传输加密**: 所有外部通信强制 TLS 1.2+。
- **静态加密**: `repo_access_token` 使用 AES-256-GCM 加密后存储。
- **Sourcemap 文件**: 在 MinIO/S3 中启用服务端加密（SSE）。
- **敏感数据脱敏**: SDK `beforeSend` 钩子允许用户在发送前清理敏感字段。
- **LLM 数据安全**: 支持自托管 LLM 选项；项目级别可配置是否允许源码发送至外部 LLM。

### 5.3 权限模型（RBAC）

| 角色 | 项目管理 | 查看 Issue | 管理 Issue | 审批修复 | 系统设置 |
|---|---|---|---|---|---|
| Admin | 全部 | 全部 | 全部 | 全部 | 全部 |
| Member | 只读 | 全部 | 全部 | 自己负责的 | 无 |
| Viewer | 只读 | 全部 | 无 | 无 | 无 |

---

## 6. 可观测性

### 6.1 日志

- 所有服务使用结构化 JSON 日志。
- 日志级别：`debug`, `info`, `warn`, `error`。
- 每条日志包含：`timestamp`, `service`, `module`, `request_id`, `level`, `message`, `metadata`。
- 生产环境级别：`info` 及以上。

### 6.2 指标（Metrics）

| 指标 | 类型 | 来源模块 |
|---|---|---|
| `gateway_events_received_total` | Counter | GatewayModule |
| `gateway_events_rejected_total` | Counter | GatewayModule |
| `gateway_request_duration_ms` | Histogram | GatewayModule |
| `queue_depth` | Gauge | 各队列 |
| `processor_events_processed_total` | Counter | ProcessorModule |
| `sourcemap_resolve_duration_ms` | Histogram | SourcemapModule |
| `ai_diagnosis_duration_ms` | Histogram | ai-agent |
| `ai_diagnosis_token_usage` | Counter | ai-agent |
| `notification_sent_total` | Counter | NotificationModule |

格式：Prometheus 兼容，通过 `GET /metrics` 端点暴露。

### 6.3 健康检查

`GET /health` 端点返回：
```json
{
  "status": "ok" | "degraded" | "down",
  "version": "0.0.1",
  "uptime": 12345,
  "checks": {
    "database": "ok",
    "redis": "ok",
    "queue": "ok"
  }
}
```

---

## 7. 扩展性设计

### 7.1 水平扩展点

| 组件 | 扩展方式 | 瓶颈 |
|---|---|---|
| apps/server | 无状态，直接水平扩展（NestJS 多实例） | 数据库写入 |
| apps/web | 无状态，Next.js 多实例 + CDN 静态资源 | 服务端渲染 CPU |
| apps/ai-agent | Worker 多实例，受 LLM API 限流约束 | 外部 API 速率 |
| PostgreSQL | 读写分离（主从复制） | 写入 TPS |

### 7.2 容量规划（Phase 1 目标）

| 指标 | 目标值 |
|---|---|
| 事件采集吞吐量 | 1,000 events/s（单 server 实例） |
| 事件处理延迟（p99） | < 5s（从 SDK 发送到 Issue 更新） |
| Sourcemap 解析延迟（p99） | < 500ms |
| AI 诊断延迟（p99） | < 60s |
| Dashboard 页面响应（p99） | < 200ms |
| 同时在线项目数 | 100 |

### 7.3 缓存策略

| 缓存键 | TTL | 用途 |
|---|---|---|
| `sourcemap:{project_id}:{release}:{file_path}` | 24h | 解析后的 Sourcemap 映射 |
| `resolve:{fingerprint}` | 1h | 解析后的堆栈信息 |
| `ratelimit:{project_id}` | 1min | 令牌桶计数器 |
| `diagnosis:{prompt_hash}` | 1h | 诊断去重 |

### 7.4 模块拆分路径

当系统达到单体瓶颈时，NestJS 模块可按以下优先级独立部署：

1. **ai-agent** — 已独立（资源隔离，GPU/高内存需求）
2. **ProcessorModule** — 最先拆出（CPU 密集，BullMQ Worker 天然无状态）
3. **GatewayModule** — 高吞吐场景独立扩展
4. **NotificationModule** — I/O 密集，可独立扩展
5. **SourcemapModule / DashboardModule** — 最后拆分

---

## 8. 灾备与容错

### 8.1 故障处理

| 故障场景 | 影响 | 应对策略 |
|---|---|---|
| Redis 不可用 | 队列暂停、限流失效 | GatewayModule 降级为同步处理（限流放开） |
| PostgreSQL 不可用 | 写入失败 | 事件暂存 Redis 队列，数据库恢复后重放 |
| LLM API 不可用 | 诊断暂停 | 任务保留在队列，不影响错误采集和展示 |
| MinIO/S3 不可用 | Sourcemap 上传/解析失败 | 错误事件正常采集，堆栈解析降级（显示原始堆栈） |
| server 实例宕机 | 部分请求失败 | SDK 重试 + 多实例负载均衡 |

### 8.2 数据备份

- PostgreSQL：每日全量备份 + WAL 持续归档。
- MinIO/S3：跨区域复制（生产环境）。
- Redis：AOF 持久化 + 定期 RDB 快照。

---

## 9. 风险登记

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| AI 生成的补丁破坏生产代码 | 严重 | 沙箱验证 + 强制人工审批 + 灰度发布 |
| Sourcemap 解析 CPU 密集 | 高 | Redis 缓存解析结果；ProcessorModule 可拆分独立部署 |
| LLM API 成本失控 | 中 | 按项目 Token 预算；缓存相同诊断；分诊使用小模型 |
| SDK 包体积过大 | 中 | Tree-shaking；懒加载；核心目标 < 10KB gzip |
| 敏感源码发送至 LLM | 严重 | 自托管 LLM 选项；秘密信息脱敏；项目级别用户同意 |
| 限流被绕过或过度限制 | 中 | 按项目可配置限额；限流异常监控 + 告警 |
