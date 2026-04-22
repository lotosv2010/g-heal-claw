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

**替代方案被否决的原因**:
- Lerna：已进入维护模式，社区活跃度下降。
- Nx：功能强大但配置复杂，对中小项目有过度工程化风险。

### 2.2 构建工具：Vite

**选择**: Vite 作为统一构建工具

**理由**:
- 前端应用（Dashboard Web）使用 Vite 作为开发服务器和生产打包工具。
- 库包（shared 等）使用 Vite Library Mode 构建。
- 统一构建工具链降低维护成本和认知负荷。
- ESBuild 预构建 + Rollup 打包的组合兼顾开发速度和产物质量。

### 2.3 前端框架：React + Shadcn/ui

**选择**: React 19 + Shadcn/ui + TailwindCSS v4

**理由**:
- React 生态成熟，开发者招聘容易。
- Shadcn/ui 不是一个组件库——它是一组可复制粘贴的组件源码，可完全自定义。
- 相比 Ant Design：Shadcn/ui 更轻量，样式自由度更高，TailwindCSS 原生集成。
- TailwindCSS v4 的 CSS-first 配置方式消除了 `tailwind.config.js` 的维护负担。

### 2.4 后端框架：Fastify

**选择**: Fastify v5

**理由**:
- 原生支持 JSON Schema 验证，与 Zod 配合良好。
- 性能优于 Express（基准测试 ~2x），适合高吞吐的数据采集场景。
- 插件系统干净，支持异步钩子。
- TypeScript 一等公民支持。

### 2.5 数据库：PostgreSQL + Drizzle ORM

**选择**: PostgreSQL 17 + Drizzle ORM

**理由**:
- PostgreSQL：成熟、可靠、JSONB 支持灵活 Schema。
- Drizzle ORM：TypeScript-first，SQL-like API（非 Active Record），类型安全的查询构建。
- 相比 Prisma：Drizzle 生成的 SQL 更可预测，不依赖二进制引擎，冷启动更快。
- 相比原始 SQL：类型安全、迁移管理、无 SQL 注入风险。

### 2.6 消息队列：Redis + BullMQ

**选择**: BullMQ（基于 Redis）

**理由**:
- 复用 Redis 基础设施（缓存 + 队列共用），减少运维复杂度。
- BullMQ 提供：优先级队列、延迟任务、重试策略、速率限制、事件监听。
- 单 Redis 实例即可支撑 Phase 1 目标（1000 events/s）。
- 未来如果需要更高吞吐量，可迁移至 Kafka（API 层抽象后替换成本可控）。

### 2.7 AI 集成：Provider 抽象层

**选择**: 自建 LLM Provider 抽象

**理由**:
- 支持 Claude (Anthropic) 和 GPT (OpenAI) 双供应商，避免供应商锁定。
- 接口设计：

```typescript
interface LLMProvider {
  diagnose(context: DiagnosisContext): Promise<DiagnosisResult>
  generateFix(context: FixContext): Promise<FixResult>
}
```

- 项目级别可配置使用哪个 Provider 和模型。
- 未来可扩展支持自托管模型（Ollama 等）。

### 2.8 对象存储：MinIO / S3

**选择**: 开发环境 MinIO，生产环境 AWS S3

**理由**:
- MinIO 提供 S3 兼容 API，本地开发无需 AWS 账号。
- 统一使用 `@aws-sdk/client-s3`，零代码改动切换环境。
- Sourcemap 文件通常几百 KB 到几 MB，对象存储比数据库更适合。

---

## 3. 设计模式

### 3.1 事件驱动架构

核心流程采用**生产者-队列-消费者**模式：

```
[Gateway] ──produce──> [Queue] ──consume──> [Processor]
```

**优势**:
- 采集（Gateway）和处理（Processor）解耦，互不影响。
- 突发流量时队列作为缓冲，Processor 按自身速率消费。
- 消费者可独立水平扩展。
- 任务失败后队列自动重试，不丢失数据。

### 3.2 指纹聚合（Fingerprint Aggregation）

同类错误通过指纹算法聚合为 Issue，而非为每个事件创建独立记录：

```
ErrorEvent (N个) ──fingerprint──> Issue (1个)
```

**设计决策**:
- 指纹使用错误类型 + 归一化的前 5 个栈帧计算 SHA256。
- 归一化去除行号/列号、动态路径段、chunk hash，确保同一逻辑错误产生相同指纹。
- Issue 表维护 `event_count`、`first_seen`、`last_seen` 聚合字段，避免每次查询 COUNT。

### 3.3 管线模式（Pipeline Pattern）

自动修复流程使用管线模式，每个阶段有明确的输入/输出契约：

```
[诊断] → [修复生成] → [验证] → [PR 创建] → [人工审批] → [部署]
```

每个阶段可独立失败和重试，不影响上游已完成的工作。

### 3.4 DSN 认证模式

SDK 使用 DSN（Data Source Name）认证，借鉴 Sentry 的成熟模式：

```
https://<publicKey>@<host>/<projectId>
```

- `publicKey` 是公开的，可安全嵌入前端代码。
- Gateway 通过 `publicKey` 查找对应的 Project，验证合法性。
- 不包含 secret key，前端暴露无安全风险。

---

## 4. 关键权衡

### 4.1 实时性 vs 成本

| 决策 | 选择 | 权衡 |
|---|---|---|
| 事件传输 | 批量（5s/10条） | 牺牲 5s 实时性，换取 90%+ 网络请求减少 |
| AI 诊断 | 异步队列 | 诊断延迟可达 60s，但不阻塞错误采集流程 |
| Sourcemap 解析 | 同步（Error Processor 内） | 增加处理延迟，但确保 Issue 创建时已有解析结果 |

### 4.2 准确性 vs 性能

| 决策 | 选择 | 权衡 |
|---|---|---|
| 指纹算法 | 前 5 帧 | 可能将不同调用路径的同类错误合并，但显著减少 Issue 碎片化 |
| 事件采样 | 客户端采样 | 高流量时丢弃部分事件，换取系统稳定性 |
| Event Count | Issue 表冗余字段 | 数据可能短暂不一致，但避免每次查询 COUNT(*) |

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
  vite.config.ts      # 使用 Vite Library Mode

apps/<name>/
  src/
    server.ts         # HTTP 服务入口 (Fastify 应用)
    worker.ts         # Worker 服务入口 (BullMQ 消费者)
  package.json
  tsconfig.json
```

### 5.2 TypeScript 约定

- **严格模式**: 所有 `strict` 选项开启。
- **模块系统**: ESM (`"type": "module"`)，`moduleResolution: "bundler"`。
- **导入**: 使用路径别名 `@/` 映射到 `src/`（仅在应用中使用，库包不使用）。
- **类型导出**: 库包通过 `vite-plugin-dts` 生成 `.d.ts` 声明文件。
- **禁止 `any`**: 使用 `unknown` 替代，必要时使用类型守卫。

### 5.3 API 设计约定

- **路由命名**: RESTful，复数名词（`/projects`、`/issues`、`/events`）。
- **请求验证**: 所有入参使用 Zod Schema 验证。
- **响应格式**: 统一 JSON 结构。

```typescript
// 成功
{ "data": T }

// 分页
{ "data": T[], "pagination": { "page": number, "limit": number, "total": number } }

// 错误
{ "error": string, "message": string, "details"?: unknown }
```

- **HTTP 状态码**:
  - 200: 成功
  - 201: 创建成功
  - 202: 已接受（异步处理）
  - 400: 请求参数无效
  - 401: 未认证
  - 403: 无权限
  - 404: 资源不存在
  - 409: 冲突（重复）
  - 429: 限流
  - 500: 内部错误

### 5.4 命名约定

| 上下文 | 风格 | 示例 |
|---|---|---|
| TypeScript 变量/函数 | camelCase | `resolveStackTrace` |
| TypeScript 类型/接口 | PascalCase | `ErrorEventPayload` |
| TypeScript 常量 | UPPER_SNAKE_CASE | `MAX_BREADCRUMBS` |
| 数据库表名 | snake_case，复数 | `error_events` |
| 数据库列名 | snake_case | `project_id` |
| API 路径 | kebab-case | `/notification-rules` |
| 环境变量 | UPPER_SNAKE_CASE | `DATABASE_URL` |
| BullMQ 队列名 | kebab-case | `error-events` |
| Git 分支 | kebab-case | `feat/sdk-breadcrumbs` |

### 5.5 错误处理约定

- **HTTP 服务**: 使用 Fastify 的 `setErrorHandler` 全局捕获。
- **Worker**: BullMQ 的 `failed` 事件 + 自定义重试策略。
- **绝不吞掉错误**: 所有 `catch` 块必须记录日志或重新抛出。
- **业务错误 vs 系统错误**:

```typescript
// 业务错误 - 已知、可预期
class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

// 使用
throw new AppError(404, 'PROJECT_NOT_FOUND', `Project ${id} not found`)
```

### 5.6 环境变量约定

- 所有环境变量在 `.env.example` 中列出。
- 应用启动时使用 Zod 校验环境变量完整性。
- 敏感变量（密码、密钥）不允许有默认值——缺失时启动失败。

```typescript
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export const env = envSchema.parse(process.env)
```

---

## 6. 目录 / 文档索引

| 文档 | 路径 | 内容 |
|---|---|---|
| 需求文档 | `docs/requirements.md` | 功能需求、交付计划、验收标准 |
| 技术规格 | `docs/SPEC.md` | SDK 接口、API 契约、数据模型 |
| 架构文档 | `docs/ARCHITECTURE.md` | 系统架构、数据流、基础设施 |
| 设计文档 | `docs/DESIGN.md` | 技术选型、设计模式、编码约定（本文档） |
