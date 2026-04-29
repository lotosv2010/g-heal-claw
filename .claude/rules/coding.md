# 编码规范

> 本文件由 Claude Code 自动加载，是项目代码规范的唯一来源。
> 项目级约束（核心规则、依赖规则）见 `CLAUDE.md`。

## TypeScript 细则

- 严格模式（`strict: true`）
- 禁止 `any` / `@ts-ignore`，用 Zod `z.infer<>` 推导类型
- 函数参数和返回值必须显式标注类型
- 使用 `readonly` 修饰不可变属性
- 优先使用 `const` 声明，避免 `let`
- ESM 模块系统（`"type": "module"`），`moduleResolution: "bundler"`

## Zod 使用规范

- API 入参/出参必须定义 Zod Schema
- 类型通过 `z.infer<typeof XxxSchema>` 导出，不手写重复类型
- Schema 命名：`PascalCase` + `Schema` 后缀（如 `ErrorEventSchema`）
- 环境变量使用 Zod Schema 校验，缺失敏感变量时启动失败
- NestJS 中通过 `ZodValidationPipe` 校验请求体

## NestJS 约定

- 使用 Fastify adapter（非默认 Express）
- Module / Controller / Service / Guard / Pipe 使用 PascalCase + 后缀
- DTO 使用 Zod Schema 定义，通过 `z.infer<>` 导出类型
- BullMQ Processor 使用 `@Processor()` 装饰器
- Swagger 文档使用 `@nestjs/swagger` 装饰器
- 全局异常使用 Exception Filter，业务异常使用 `AppException`

## Next.js 约定

- 使用 App Router（`app/` 目录）
- 服务端组件优先，客户端组件使用 `'use client'` 声明
- Server Actions 处理表单交互
- 组件放 `components/`，工具函数放 `lib/`
- 样式使用 TailwindCSS v4，组件使用 Shadcn/ui

## 命名规范

| 类型 | 风格 | 示例 |
|---|---|---|
| TypeScript 变量/函数 | camelCase | `resolveStackTrace` |
| TypeScript 类型/接口 | PascalCase | `ErrorEventPayload` |
| TypeScript 常量 | UPPER_SNAKE_CASE | `MAX_BREADCRUMBS` |
| Zod Schema | PascalCase + Schema | `ErrorEventSchema` |
| NestJS 组件 | PascalCase + 后缀 | `GatewayModule`, `GatewayService` |
| 数据库表名 | snake_case，复数 | `error_events` |
| 数据库列名 | snake_case | `project_id` |
| API 路径 | kebab-case | `/notification-rules` |
| 环境变量 | UPPER_SNAKE_CASE | `DATABASE_URL` |
| BullMQ 队列名 | kebab-case | `error-events` |
| npm 包名 | `@g-heal-claw/` 前缀 | `@g-heal-claw/sdk` |
| Git 分支 | kebab-case | `feat/sdk-breadcrumbs` |

## 模块结构

### packages（库包）

```
packages/<name>/
├── src/
│   └── index.ts          # 唯一公开导出入口
├── package.json
├── tsconfig.json
└── vite.config.ts        # 构建配置（见下）
```

**构建工具选择**（ADR-0009）：

| 包类型 | 构建工具 | 理由 |
|---|---|---|
| `packages/shared` 等**纯类型 + Zod Schema + 常量**包 | `tsc --build` 直出 `dist/*.js` + `dist/*.d.ts` | 无需 bundling / tree-shake / minify；零配置、产物清晰、TS 引用工程原生支持 |
| `packages/sdk` / `cli` / `vite-plugin` 等需浏览器兼容或发布到 npm 的包 | Vite Library Mode（ESM + UMD 双格式 + sourcemap） | 必须 tree-shake 与体积优化；SDK 还需严格的体积预算 |

### apps/server（NestJS 后端）

```
apps/server/
├── src/
│   ├── <module>/
│   │   ├── <module>.module.ts
│   │   ├── <module>.controller.ts
│   │   ├── <module>.service.ts
│   │   ├── <module>.processor.ts  # BullMQ Worker（如有）
│   │   └── dto/                   # Zod Schema + 类型
│   ├── shared/
│   │   ├── shared.module.ts
│   │   └── database/              # Drizzle Schema + 迁移
│   └── main.ts
├── package.json
└── tsconfig.json
```

### apps/web（Next.js 前端）

```
apps/web/
├── app/                         # App Router
│   ├── (auth)/                  # 认证页面
│   ├── (console)/               # 管理面板（ADR-0021 四分组菜单）
│   │   ├── dashboard/           # 仪表盘（overview / realtime）
│   │   ├── monitor/             # 监控（performance / errors / api / resources / visits / logs）
│   │   ├── tracking/            # 埋点（events / exposure / funnel / retention / custom）
│   │   └── settings/            # 设置（projects / members / tokens / sourcemaps / alerts / channels / ai）
│   └── layout.tsx
├── components/                  # UI 组件（Shadcn/ui）
├── lib/                         # 工具函数
├── package.json
└── tsconfig.json
```

### apps/ai-agent（LangChain Agent）

```
apps/ai-agent/
├── src/
│   ├── agent.ts           # LangChain Agent 定义
│   ├── tools/             # Agent Tools
│   └── worker.ts          # BullMQ 消费入口
├── package.json
└── tsconfig.json
```

## API 设计规范

- RESTful 路由，复数名词（`/projects`、`/issues`）
- 所有入参使用 Zod Schema 验证（NestJS Pipe）
- Swagger 文档通过 `@nestjs/swagger` 自动生成
- 统一响应格式：

```typescript
// 成功
{ "data": T }

// 分页
{ "data": T[], "pagination": { "page": number, "limit": number, "total": number } }

// 错误
{ "error": string, "message": string, "details"?: unknown }
```

## 错误处理

- 业务错误使用自定义 `AppException` 类（继承 HttpException，含 code + message）
- NestJS 使用 Exception Filter 全局捕获
- BullMQ Worker 使用 `@OnQueueFailed()` + 自定义重试策略
- 禁止空 catch 块
- 所有 catch 必须记录日志或重新抛出

## 测试标准

| 层次 | 覆盖对象 | 工具 |
|---|---|---|
| 单元 | Service、工具函数、Zod Schema | Vitest |
| 模块 | NestJS 模块（含 DB mock） | NestJS TestingModule + pg-mem |
| 集成 | Gateway → Processor → DB 端到端 | Dockerized PG / Redis + 真实队列 |
| 端到端 | Dashboard 关键流程 | Playwright |
| SDK 浏览器 | SDK 运行时行为 | Playwright + jsdom 补齐 |
| 契约 | SDK ↔ Gateway / Dashboard ↔ Web | Zod Schema 双端复用 |
| 压测 | Gateway 吞吐、Processor 消费速率 | k6 / autocannon |

- 业务逻辑必须有单元测试；修复 Bug 必须附带回归测试
- 测试验证行为，而非实现细节
- **集成测试禁止 mock 数据库**，一律使用 Dockerized PG

### 测试文件放置规则（强制）

- **所有测试文件必须集中放置在对应包/应用根目录下的 `tests/` 文件夹中**，禁止散落在 `src/`、`app/`、`components/`、`lib/` 等业务目录
- 命名沿用 `*.test.ts` / `*.spec.ts`（TSX 同理），但**路径**必须以 `tests/` 为根
- 目录镜像源码结构，便于定位：
  - `packages/sdk/src/plugins/error.ts` → `packages/sdk/tests/plugins/error.test.ts`
  - `apps/server/src/dashboard/errors.service.ts` → `apps/server/tests/dashboard/errors.service.spec.ts`
- 端到端 / 集成测试按既有层次归类：`tests/unit/`、`tests/integration/`、`tests/e2e/`（按需）
- **审查红线**：`src/**/*.{test,spec}.{ts,tsx}` 出现即判定违规，必须迁移至 `tests/`

## 注释与文档

- 代码注释和项目文档统一使用中文
- 公开 API 使用 JSDoc 注释
- 注释说明"为什么"，而非"做什么"
- 禁止大段注释块，一行足矣
