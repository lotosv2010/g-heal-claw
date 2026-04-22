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
└── vite.config.ts        # Vite Library Mode
```

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
├── app/                   # App Router
│   ├── (auth)/            # 认证页面
│   ├── (dashboard)/       # 管理面板
│   └── layout.tsx
├── components/            # UI 组件（Shadcn/ui）
├── lib/                   # 工具函数
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

## 注释与文档

- 代码注释和项目文档统一使用中文
- 公开 API 使用 JSDoc 注释
- 注释说明"为什么"，而非"做什么"
- 禁止大段注释块，一行足矣
