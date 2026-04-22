# 架构规则

> 本文件由 Claude Code 自动加载，指导架构决策和模块扩展。
> 完整架构设计见 `docs/ARCHITECTURE.md`。

## 应用边界

| 应用 | 框架 | 职责 |
|---|---|---|
| `apps/server` | NestJS (Fastify adapter) | 全部后端逻辑（模块化单体） |
| `apps/web` | Next.js (App Router) | 管理面板 SSR 前端 |
| `apps/ai-agent` | LangChain + Node.js | AI 诊断、修复生成、Git 操作 |

## NestJS 模块边界（apps/server）

| 模块 | 职责范围 | 通信方式 |
|---|---|---|
| GatewayModule | 仅负责接收、校验、限流、入队 | HTTP 入 → BullMQ 出 |
| ProcessorModule | 仅负责消费事件、指纹计算、Issue 聚合 | BullMQ 入 → DB 写 + BullMQ 出 |
| SourcemapModule | 仅负责 Sourcemap 存储和堆栈解析 | 被 ProcessorModule 进程内调用 + HTTP API |
| NotificationModule | 仅负责通知分发 | BullMQ 入 → 外部渠道 |
| DashboardModule | 仅负责面向前端的 CRUD 和认证 | HTTP（web 调用） |
| SharedModule | 数据库连接、Redis、BullMQ 注册、通用组件 | 全局注入 |

**模块间通信规则**：
- 模块间通过 **NestJS DI** 注入 Service（同进程内调用）
- 异步任务通过 **BullMQ 队列** 解耦
- 禁止模块间直接导入 Controller，只允许导入 Service

## 通信规则

1. **外部到内部**: 仅通过 server/GatewayModule 和 SourcemapModule 的 HTTP API
2. **模块间异步**: 统一通过 BullMQ 队列
3. **server 到 ai-agent**: 仅通过 BullMQ 队列（`ai-diagnosis`、`auto-fix`）
4. **web 到 server**: HTTP REST API
5. **数据库访问**: 统一通过 SharedModule 提供的 Drizzle 连接
6. **缓存访问**: 统一通过 Redis，按 key 前缀隔离命名空间

## 包依赖规则

| 层级 | 可依赖 | 禁止依赖 |
|---|---|---|
| `packages/shared` | zod | 任何运行时框架（nestjs, react, langchain 等） |
| `packages/sdk` | shared | 任何 Node.js API（必须浏览器兼容） |
| `packages/cli` | shared | apps 下的任何包 |
| `apps/server` | shared, nestjs 生态, drizzle, bullmq | apps/web, apps/ai-agent |
| `apps/web` | shared, react/next 生态 | apps/server, apps/ai-agent, nestjs, bullmq |
| `apps/ai-agent` | shared, langchain | apps/server, apps/web, nestjs |

## 新增 NestJS 模块检查清单

在 `apps/server/src/<name>/` 新建模块时必须满足：

1. 包含 `<name>.module.ts` 定义 Module
2. 在根 `AppModule` 中注册
3. 有对外暴露的 HTTP 端点时，提供 `@nestjs/swagger` 装饰器
4. 异步任务通过 BullMQ 队列，队列名在 `packages/shared` 中定义
5. 更新 `docs/ARCHITECTURE.md` 模块拓扑

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
- **禁止绕过 GatewayModule 直接写入数据库** — 所有外部事件必须经过 GatewayModule 认证和限流
