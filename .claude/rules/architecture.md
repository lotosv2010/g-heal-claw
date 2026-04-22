# 架构规则

> 本文件由 Claude Code 自动加载，指导架构决策和模块扩展。
> 完整架构设计见 `docs/ARCHITECTURE.md`。

## 服务边界

| 服务 | 职责范围 | 通信方式 |
|---|---|---|
| Gateway | 仅负责接收、校验、限流、入队 | HTTP 入 → BullMQ 出 |
| Error Processor | 仅负责消费事件、指纹计算、Issue 聚合 | BullMQ 入 → DB 写 + BullMQ 出 |
| Sourcemap Service | 仅负责 Sourcemap 存储和堆栈解析 | HTTP（被其他服务调用） |
| AI Engine | 仅负责 LLM 调用和诊断结果存储 | BullMQ 入 → LLM API → DB 写 |
| Notification Service | 仅负责通知分发 | BullMQ 入 → 外部渠道 |
| Auto-Fix Worker | 仅负责 Git 操作和 PR 创建 | BullMQ 入 → Git API |
| Dashboard API | 仅负责面向前端的 CRUD 和认证 | HTTP（前端调用） |
| Dashboard Web | 仅负责 UI 展示和交互 | HTTP（调用 Dashboard API） |

**违规判断：** 如果一个服务承担了上表之外的职责，必须重构或拆分。

## 通信规则

1. **外部到内部**: 仅通过 Gateway 和 Sourcemap Service 的 HTTP API
2. **服务间异步**: 统一通过 BullMQ 队列，禁止服务间直接 HTTP 调用（Sourcemap Service 例外，因其提供同步解析）
3. **数据库访问**: 每个需要持久化的服务独立连接 PostgreSQL，共享同一个数据库实例
4. **缓存访问**: 统一通过 Redis，按 key 前缀隔离命名空间

## 包依赖规则

| 层级 | 可依赖 | 禁止依赖 |
|---|---|---|
| `packages/shared` | zod | 任何运行时框架（fastify, react 等） |
| `packages/sdk` | shared | 任何 Node.js API（必须浏览器兼容） |
| `packages/cli` | shared | apps 下的任何包 |
| `apps/*` | shared | 其他 apps 下的包（通过队列通信） |
| `apps/dashboard-web` | shared, react 生态 | 后端包（fastify, bullmq 等） |

## 新增服务检查清单

新建 `apps/<name>/` 时必须满足：

1. 包含 `src/server.ts`（HTTP 服务）或 `src/worker.ts`（Worker 服务）作为入口
2. 环境变量通过 Zod Schema 校验（`src/env.ts`）
3. 提供 `GET /health` 端点（HTTP 服务必须）
4. 队列名在 `packages/shared` 中常量定义，不硬编码
5. 更新 `docs/ARCHITECTURE.md` 服务拓扑图
6. 更新 `docker-compose.yml`（如需额外基础设施）

## 新增 packages 检查清单

新建 `packages/<name>/` 时必须满足：

1. 包含 `src/index.ts` 作为唯一公开导出入口
2. 使用 Vite Library Mode 构建，输出 ESM 格式
3. `package.json` 配置 `exports` 字段
4. 零副作用（除非是 SDK 或 CLI 等入口包）

## 架构红线

- **禁止循环依赖** — packages 之间、apps 之间均不得出现循环 import
- **禁止 apps 间直接引用** — 只能通过 shared 包共享类型，通过 BullMQ 队列通信
- **禁止在 shared 包引入运行时副作用** — shared 必须是纯类型定义 + 纯函数
- **禁止 SDK 使用 Node.js API** — SDK 必须浏览器兼容，零 Node.js 依赖
- **禁止绕过 Gateway 直接写入数据库** — 所有外部事件必须经过 Gateway 认证和限流
