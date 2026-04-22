# g-heal-claw 技术设计文档

> 版本: 1.0.0 | 日期: 2026-04-22

---

## 1. 概述

本文档记录 g-heal-claw 的关键技术决策、设计模式、权衡取舍和编码约定。目的是让任何新加入的工程师都能理解"为什么这样做"，而不仅仅是"做了什么"。

---

## 2. 技术选型与理由

### 2.1 Monorepo 管理：pnpm + Turborepo

**选择**: pnpm workspaces + Turborepo

**理由**:
- pnpm 的硬链接机制节省磁盘空间，`workspace:*` 协议天然支持本地包引用。
- Turborepo 提供任务编排（`^build` 依赖拓扑）和构建缓存，增量构建显著加速。
- 相比 Nx：Turborepo 更轻量，配置更简单，适合项目初期。

### 2.2 后端框架：NestJS（Fastify 适配器）

**选择**: NestJS + Fastify adapter

**理由**:
- **模块系统** = 逻辑微服务边界。每个 Module（Gateway、Processor、Sourcemap、Notification、Dashboard）职责单一，但共享同一进程，消除服务间 HTTP 调用和分布式事务。
- **内置生态**：`@nestjs/bull` 队列、`@nestjs/swagger` 文档、`@nestjs/jwt` 认证、`@nestjs/config` 配置 — 开箱即用，减少胶水代码。
- **Fastify 适配器**: 性能优于 Express（~2x），同时保留 NestJS 的 DI + 装饰器开发体验。
- **渐进式拆分**: 当单体达到瓶颈时，Module 可独立部署为微服务（NestJS 内置 Transport 层支持 Redis/gRPC/NATS）。

**替代方案被否决的原因**:
- 纯 Fastify：缺乏模块系统和 DI，8 个服务需要自建大量基础设施代码。
- 8 个独立微服务：MVP 阶段运维复杂度过高，团队 3-4 人无法有效管理。

### 2.3 前端框架：Next.js

**选择**: Next.js (App Router) + Shadcn/ui + TailwindCSS v4

**理由**:
- **App Router**: 服务端组件（RSC）减少客户端 JS，Server Actions 简化表单交互。
- **SSR/SSG**: 管理面板首屏快，SEO 友好（公开状态页等场景）。
- **内置 API Routes**: 可作为 BFF 层代理 NestJS API，处理认证 Session。
- **Shadcn/ui**: 非组件库，是可复制粘贴的组件源码，完全可定制。
- **TailwindCSS v4**: CSS-first 配置，零 JS 配置文件。

**替代方案被否决的原因**:
- React SPA (Vite): 缺少 SSR，首屏白屏时间长，Dashboard 场景体验差。
- Remix: 生态不如 Next.js 成熟，Vercel 部署优势无法利用。

### 2.4 AI 引擎：LangChain Agent

**选择**: LangChain + ReAct Agent 模式

**理由**:
- **Agent 模式** vs 纯 Prompt→Response: Agent 可多步推理，自主调用工具（读源码、搜相似 Issue、执行沙箱），诊断质量远超单轮 prompt。
- **Tool 抽象**: 标准化的 Tool 接口，易于扩展新能力（如 read_source、git_clone、run_sandbox）。
- **Provider 抽象**: LangChain 内置 Claude/GPT/Ollama 多 Provider 支持，切换零改动。
- **独立部署**: AI Agent 资源消耗（内存、CPU）与主服务差异大，独立进程便于资源隔离和扩展。

**替代方案被否决的原因**:
- 自建 LLM Provider 抽象：仅支持单轮对话，无法实现多步推理和工具调用。
- CrewAI/AutoGen: 多 Agent 协作对诊断场景过重，增加不必要的复杂度。

### 2.5 数据库：PostgreSQL + Drizzle ORM

**选择**: PostgreSQL 17 + Drizzle ORM

**理由**:
- PostgreSQL：成熟、可靠、JSONB 支持灵活 Schema。
- Drizzle ORM：TypeScript-first，SQL-like API，类型安全的查询构建。
- 相比 Prisma：Drizzle 生成的 SQL 更可预测，不依赖二进制引擎，冷启动更快。

### 2.6 消息队列：Redis + BullMQ

**选择**: BullMQ（基于 Redis）

**理由**:
- 复用 Redis（缓存 + 队列共用），减少运维复杂度。
- NestJS `@nestjs/bull` 原生集成，装饰器定义 Processor。
- 单 Redis 实例即可支撑 Phase 1 目标（1000 events/s）。

### 2.7 对象存储：MinIO / S3

**选择**: 开发环境 MinIO，生产环境 AWS S3

**理由**:
- MinIO 提供 S3 兼容 API，本地开发无需 AWS 账号。
- 统一使用 `@aws-sdk/client-s3`，零代码改动切换环境。

---

## 3. 设计模式

### 3.1 模块化单体（Modular Monolith）

核心后端采用 NestJS 模块化单体模式：

```
apps/server/
├── src/
│   ├── gateway/         # GatewayModule — 事件采集
│   ├── processor/       # ProcessorModule — 事件处理
│   ├── sourcemap/       # SourcemapModule — 堆栈解析
│   ├── notification/    # NotificationModule — 通知分发
│   ├── dashboard/       # DashboardModule — REST API
│   ├── shared/          # SharedModule — 数据库/Redis/通用
│   └── main.ts          # 入口（Fastify adapter）
```

**优势**:
- 开发期：一个进程启动所有模块，调试方便。
- 部署期：单个容器即可运行，运维简单。
- 扩展期：Module 可按需拆分为独立微服务。

### 3.2 事件驱动 + 队列解耦

高延迟操作通过 BullMQ 异步处理：

```
[GatewayModule] ──produce──> [error-events] ──consume──> [ProcessorModule]
[ProcessorModule] ──produce──> [ai-diagnosis] ──consume──> [ai-agent]
```

### 3.3 ReAct Agent 模式（AI 诊断）

AI 诊断采用 LangChain ReAct (Reasoning + Acting) 模式：

```
输入: Issue 详情 + 错误信息
循环:
  1. 思考: 还需要什么信息？
  2. 行动: 调用 Tool（read_source / search_similar / ...）
  3. 观察: 工具返回结果
  4. 重复直到有足够信息
输出: 结构化诊断 Markdown
```

**Agent Tools**:
| Tool | 功能 | 使用阶段 |
|---|---|---|
| `read_source` | 从 Sourcemap 获取源码上下文 | 诊断 |
| `read_breadcrumbs` | 获取事件面包屑和上下文 | 诊断 |
| `search_similar` | 搜索历史相似 Issue 的诊断 | 诊断 |
| `git_clone` | 浅克隆仓库到沙箱 | 修复 |
| `apply_patch` | 应用 unified diff 补丁 | 修复 |
| `run_sandbox` | 沙箱运行 lint + tsc 验证 | 修复 |
| `create_pr` | 创建分支、提交、PR | 修复 |

### 3.4 指纹聚合（Fingerprint Aggregation）

同类错误通过指纹算法聚合为 Issue：

```
ErrorEvent (N个) ──fingerprint──> Issue (1个)
```

指纹使用错误类型 + 归一化的前 5 个栈帧计算 SHA256。Issue 表维护冗余聚合字段避免 COUNT 查询。

### 3.5 DSN 认证模式

SDK 使用 DSN 认证（借鉴 Sentry）：

```
https://<publicKey>@<host>/<projectId>
```

`publicKey` 可安全嵌入前端代码，不含 secret。

---

## 4. 关键权衡

### 4.1 单体 vs 微服务

| 决策 | 选择 | 权衡 |
|---|---|---|
| 后端架构 | NestJS 模块化单体 | 牺牲独立部署灵活性，换取 MVP 阶段 10x 降低运维复杂度 |
| AI Agent | 独立进程 | 额外的进程间通信开销，但隔离了高资源消耗和长耗时操作 |

### 4.2 实时性 vs 成本

| 决策 | 选择 | 权衡 |
|---|---|---|
| 事件传输 | 批量（5s/10条） | 牺牲 5s 实时性，换取 90%+ 网络请求减少 |
| AI 诊断 | 异步队列 | 诊断延迟可达 60s，但不阻塞错误采集流程 |
| Sourcemap 解析 | 同步（Processor 内调用） | 增加处理延迟，但确保 Issue 创建时已有解析结果 |

### 4.3 安全性 vs 功能

| 决策 | 选择 | 权衡 |
|---|---|---|
| 源码发送至 LLM | 项目级别可关闭 | 关闭后 AI 诊断质量下降，但保护代码隐私 |
| 自动修复 | 强制人工审批 | 降低修复速度，但杜绝 AI 生成的代码直接进入生产 |
| Sourcemap 存储 | 90 天自动清理 | 超过 90 天的旧版本无法解析堆栈，但控制存储成本 |

---

## 5. 编码约定

### 5.1 项目结构约定

```
packages/<name>/
  src/
    index.ts          # 唯一的公开导出入口
  package.json
  tsconfig.json
  vite.config.ts      # Vite Library Mode（SDK、shared 等库包）

apps/server/
  src/
    <module>/
      <module>.module.ts      # NestJS Module 定义
      <module>.controller.ts  # HTTP 控制器（如有）
      <module>.service.ts     # 业务逻辑
      <module>.processor.ts   # BullMQ Worker（如有）
      dto/                    # Zod Schema + 类型
    shared/
      shared.module.ts        # 全局模块（DB, Redis, BullMQ）
      database/               # Drizzle Schema + 迁移
    main.ts                   # 入口（NestJS + Fastify）

apps/web/
  app/                        # Next.js App Router
    (auth)/                   # 认证相关页面
    (dashboard)/              # 管理面板页面
    layout.tsx
  components/                 # UI 组件
  lib/                        # 工具函数

apps/ai-agent/
  src/
    agent.ts                  # LangChain Agent 定义
    tools/                    # Agent Tools（read_source, git_clone 等）
    worker.ts                 # BullMQ 消费入口
```

### 5.2 TypeScript 约定

- **严格模式**: 所有 `strict` 选项开启。
- **模块系统**: ESM (`"type": "module"`)，`moduleResolution: "bundler"`。
- **禁止 `any`**: 使用 `unknown` 替代，必要时使用类型守卫。
- **NestJS 特有**: DTO 使用 Zod Schema + `z.infer<>` 推导类型；通过 `ZodValidationPipe` 校验。

### 5.3 API 设计约定

- **路由命名**: RESTful，复数名词（`/projects`、`/issues`、`/events`）。
- **请求验证**: 所有入参使用 Zod Schema 验证（NestJS Pipe）。
- **Swagger**: 使用 `@nestjs/swagger` 装饰器自动生成 OpenAPI 文档。
- **响应格式**: 统一 JSON 结构。

```typescript
// 成功
{ "data": T }

// 分页
{ "data": T[], "pagination": { "page": number, "limit": number, "total": number } }

// 错误
{ "error": string, "message": string, "details"?: unknown }
```

### 5.4 命名约定

| 上下文 | 风格 | 示例 |
|---|---|---|
| TypeScript 变量/函数 | camelCase | `resolveStackTrace` |
| TypeScript 类型/接口 | PascalCase | `ErrorEventPayload` |
| TypeScript 常量 | UPPER_SNAKE_CASE | `MAX_BREADCRUMBS` |
| NestJS Module/Controller/Service | PascalCase + 后缀 | `GatewayModule`, `GatewayService` |
| 数据库表名 | snake_case，复数 | `error_events` |
| 数据库列名 | snake_case | `project_id` |
| API 路径 | kebab-case | `/notification-rules` |
| 环境变量 | UPPER_SNAKE_CASE | `DATABASE_URL` |
| BullMQ 队列名 | kebab-case | `error-events` |
| Git 分支 | kebab-case | `feat/sdk-breadcrumbs` |

### 5.5 错误处理约定

- **NestJS**: 使用 Exception Filter 全局捕获，`AppException` 业务异常类。
- **BullMQ Worker**: `@OnQueueFailed()` 装饰器 + 自定义重试策略。
- **绝不吞掉错误**: 所有 `catch` 块必须记录日志或重新抛出。

```typescript
// 业务异常
class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    statusCode: number = 400,
  ) {
    super({ error: code, message }, statusCode)
  }
}

// 使用
throw new AppException('PROJECT_NOT_FOUND', `Project ${id} not found`, 404)
```

### 5.6 环境变量约定

- 所有环境变量在 `.env.example` 中列出。
- 使用 NestJS `@nestjs/config` + Zod 校验环境变量完整性。
- 敏感变量（密码、密钥）不允许有默认值——缺失时启动失败。

---

## 6. 目录 / 文档索引

| 文档 | 路径 | 内容 |
|---|---|---|
| 技术规格 | `docs/SPEC.md` | SDK 接口、API 契约、数据模型 |
| 架构文档 | `docs/ARCHITECTURE.md` | 系统架构、数据流、基础设施 |
| 设计文档 | `docs/DESIGN.md` | 技术选型、设计模式、编码约定（本文档） |
| 任务跟踪 | `docs/tasks/CURRENT.md` | 任务分解、进度追踪、验收标准 |
