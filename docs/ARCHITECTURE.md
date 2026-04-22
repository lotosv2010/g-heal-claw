# g-heal-claw 系统架构文档

> 版本: 1.0.0 | 日期: 2026-04-22

---

## 1. 架构总览

g-heal-claw 采用**事件驱动的微服务架构**，通过消息队列解耦各处理阶段，确保高吞吐量和故障隔离。

```
┌──────────────┐     HTTPS      ┌──────────────────┐     BullMQ      ┌──────────────────┐
│   用户应用    │ ─────────────> │   数据采集网关    │ ─────────────> │    错误处理器     │
│  (内嵌 SDK)   │               │   (Gateway)       │               │ (Error Processor) │
└──────────────┘               └──────────────────┘               └────────┬─────────┘
                                                                           │
                                       ┌───────────────────────────────────┤
                                       │                                   │
                                       v                                   v
                              ┌──────────────────┐              ┌──────────────────┐
                              │  Sourcemap 服务   │              │   AI 诊断引擎     │
                              │  (解析/存储/还原)  │              │ (LLM 分析/方案)   │
                              └──────────────────┘              └────────┬─────────┘
                                                                         │
                                                   ┌─────────────────────┼─────────────────────┐
                                                   │                     │                     │
                                                   v                     v                     v
                                          ┌──────────────┐    ┌──────────────────┐   ┌──────────────┐
                                          │  通知服务     │    │  自动修复管线     │   │  后台管理面板 │
                                          │ (多渠道推送)  │    │ (Git/PR/部署)    │   │  (Dashboard) │
                                          └──────────────┘    └──────────────────┘   └──────────────┘
```

---

## 2. 服务拓扑

### 2.1 服务清单

| 服务 | 类型 | 端口 | 职责 |
|---|---|---|---|
| Gateway | HTTP 服务 | 3001 | 接收 SDK 事件、DSN 认证、限流、入队 |
| Sourcemap Service | HTTP 服务 | 3002 | Sourcemap 上传/存储/堆栈解析 |
| Dashboard API | HTTP 服务 | 3003 | 后台管理 REST API、JWT 认证 |
| AI Engine | HTTP + Worker | 3004 | LLM 诊断、方案生成、成本控制 |
| Notification Service | Worker | 3005 | 多渠道通知分发 |
| Error Processor | Worker | — | 事件消费、指纹计算、Issue 聚合 |
| Auto-Fix Worker | Worker | — | Git 克隆、补丁生成、PR 创建 |
| Dashboard Web | 静态资源 | 5173 (dev) | React SPA 前端 |

### 2.2 服务间通信

```
SDK ──HTTP──> Gateway ──BullMQ──> Error Processor ──HTTP──> Sourcemap Service
                                       │
                                       ├──BullMQ──> AI Engine
                                       ├──BullMQ──> Notification Service
                                       └──BullMQ──> Auto-Fix Worker

Dashboard Web ──HTTP──> Dashboard API ──SQL──> PostgreSQL
                                       ──HTTP──> 各后端服务 (内部调用)
```

**通信协议**:
- 外部（SDK -> Gateway）: HTTPS + JSON
- 内部同步调用: HTTP + JSON（服务间 REST）
- 内部异步调用: Redis + BullMQ（消息队列）
- 数据持久化: PostgreSQL（SQL）
- 文件存储: MinIO/S3（HTTP）
- 缓存: Redis

---

## 3. 数据流

### 3.1 错误采集流程

```
1. 用户应用发生错误
2. SDK 捕获错误 → 收集上下文 + 面包屑 → 批量缓冲
3. SDK 发送 POST /api/v1/events → Gateway
4. Gateway 验证 DSN → Zod 校验载荷 → 检查限流
5. Gateway 将事件推入 BullMQ "error-events" 队列 → 返回 202
6. Error Processor 消费事件：
   a. 调用 Sourcemap Service 解析堆栈
   b. 计算指纹（SHA256）
   c. 匹配已有 Issue（指纹去重）或创建新 Issue
   d. 分类严重等级
7. 若为新 Issue 或回归 Issue：
   a. 推入 "ai-diagnosis" 队列 → AI Engine
   b. 推入 "notification" 队列 → Notification Service
```

### 3.2 AI 诊断流程

```
1. AI Engine 从 "ai-diagnosis" 队列消费任务
2. 检查 prompt_hash 去重（同一 Issue 1小时内不重复）
3. 检查项目月度 token 预算
4. 从 Sourcemap Service 获取源码上下文（前后各 5 行）
5. 构造 Prompt → 调用 LLM API (Claude/GPT)
6. 解析响应 → 存储 AIDiagnosis 记录
7. 若包含代码建议 → 推入 "auto-fix" 队列
```

### 3.3 自动修复流程

```
1. Auto-Fix Worker 从 "auto-fix" 队列消费任务
2. 通过 GitHub/GitLab API 浅克隆仓库（release tag）
3. 应用 AI 生成的 unified diff 补丁
4. 在沙箱中运行验证（lint + type check）
5. 验证通过 → 创建分支 "g-heal-claw/fix/{issue-id}"
6. 提交 + 推送 + 创建 PR（描述包含诊断 Markdown）
7. 推送通知给项目 Owner
8. Owner 在 Dashboard 中审批
9. 审批通过 → 合并 PR → 触发 CI/CD 流水线
10. 部署成功 → Issue 状态更新为 "auto_fixed"
```

### 3.4 Sourcemap 上传流程

```
1. 用户构建项目（vite build / webpack build）
2. 构建插件自动调用或用户手动执行 CLI:
   npx @g-heal-claw/cli upload-sourcemaps --release X --path ./dist
3. CLI 扫描 *.map 文件 → 逐个 POST /api/v1/sourcemaps
4. Sourcemap Service 存储到 MinIO/S3
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
| `error-events` | Gateway | Error Processor | 按项目并行 | 3 次，指数退避 |
| `ai-diagnosis` | Error Processor | AI Engine | 1（LLM API 限流） | 2 次 |
| `notification` | Error Processor / AI Engine | Notification Service | 5 | 3 次 |
| `auto-fix` | AI Engine | Auto-Fix Worker | 1（Git 操作） | 1 次 |

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
                     ┌─── CDN (Dashboard 静态资源)
                     │
用户 ──> 负载均衡 ──┼─── Gateway 集群 (水平扩展)
                     │
                     └─── Dashboard API 集群

内部网络:
  Error Processor 集群 ──> PostgreSQL (主从)
  AI Engine               ──> Redis Cluster
  Notification Service    ──> MinIO/S3
  Auto-Fix Worker
```

---

## 5. 安全架构

### 5.1 认证层次

| 场景 | 认证方式 |
|---|---|
| SDK -> Gateway | DSN (publicKey) 通过 `X-GHC-Auth` 头 |
| CLI -> Sourcemap Service | API Key 通过 `Authorization: Bearer` |
| 用户 -> Dashboard API | JWT + Refresh Token |
| 服务间调用 | 内部 Service Token（共享密钥） |
| Dashboard API -> Git Provider | OAuth / Personal Access Token |

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
- 每条日志包含：`timestamp`, `service`, `request_id`, `level`, `message`, `metadata`。
- 生产环境级别：`info` 及以上。

### 6.2 指标（Metrics）

| 指标 | 类型 | 来源 |
|---|---|---|
| `gateway_events_received_total` | Counter | Gateway |
| `gateway_events_rejected_total` | Counter | Gateway |
| `gateway_request_duration_ms` | Histogram | Gateway |
| `queue_depth` | Gauge | 各队列 |
| `processor_events_processed_total` | Counter | Error Processor |
| `sourcemap_resolve_duration_ms` | Histogram | Sourcemap Service |
| `ai_diagnosis_duration_ms` | Histogram | AI Engine |
| `ai_diagnosis_token_usage` | Counter | AI Engine |
| `notification_sent_total` | Counter | Notification Service |

格式：Prometheus 兼容，通过 `GET /metrics` 端点暴露。

### 6.3 健康检查

所有 HTTP 服务提供 `GET /health` 端点，返回：
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
| Gateway | 无状态，直接水平扩展 | 网络 I/O |
| Error Processor | BullMQ Worker 多实例 | 数据库写入 |
| Sourcemap Service | 无状态，水平扩展 + Sourcemap 解析缓存 | CPU（解析） |
| AI Engine | Worker 多实例，受 LLM API 限流约束 | 外部 API 速率 |
| Dashboard API | 无状态，水平扩展 | 数据库查询 |
| PostgreSQL | 读写分离（主从复制） | 写入 TPS |

### 7.2 容量规划（Phase 1 目标）

| 指标 | 目标值 |
|---|---|
| 事件采集吞吐量 | 1,000 events/s（单 Gateway 实例） |
| 事件处理延迟（p99） | < 5s（从 SDK 发送到 Issue 更新） |
| Sourcemap 解析延迟（p99） | < 500ms |
| AI 诊断延迟（p99） | < 60s |
| Dashboard API 响应（p99） | < 200ms |
| 同时在线项目数 | 100 |

### 7.3 缓存策略

| 缓存键 | TTL | 用途 |
|---|---|---|
| `sourcemap:{project_id}:{release}:{file_path}` | 24h | 解析后的 Sourcemap 映射 |
| `resolve:{fingerprint}` | 1h | 解析后的堆栈信息 |
| `ratelimit:{project_id}` | 1min | 令牌桶计数器 |
| `diagnosis:{prompt_hash}` | 1h | 诊断去重 |

---

## 8. 灾备与容错

### 8.1 故障处理

| 故障场景 | 影响 | 应对策略 |
|---|---|---|
| Redis 不可用 | 队列暂停、限流失效 | Gateway 降级为同步处理（限流放开） |
| PostgreSQL 不可用 | 写入失败 | 事件暂存 Redis 队列，数据库恢复后重放 |
| LLM API 不可用 | 诊断暂停 | 任务保留在队列，不影响错误采集和展示 |
| MinIO/S3 不可用 | Sourcemap 上传/解析失败 | 错误事件正常采集，堆栈解析降级（显示原始堆栈） |
| Gateway 实例宕机 | 部分事件丢失 | SDK 重试 + 多实例负载均衡 |

### 8.2 数据备份

- PostgreSQL：每日全量备份 + WAL 持续归档。
- MinIO/S3：跨区域复制（生产环境）。
- Redis：AOF 持久化 + 定期 RDB 快照。
