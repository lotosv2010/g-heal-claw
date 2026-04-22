# g-heal-claw — 自愈式生产监控系统

## 项目定位

面向前端团队的自愈式生产监控系统。通过轻量 SDK 捕获错误，Sourcemap 还原堆栈，AI 诊断根因并自动生成修复 PR。

> 需求文档见 `docs/requirements.md` | 技术规格见 `docs/SPEC.md` | 系统架构见 `docs/ARCHITECTURE.md` | 技术设计见 `docs/DESIGN.md`

## 技术栈

| 类别 | 选型 |
|---|---|
| 语言 | TypeScript (strict) + Zod |
| Monorepo | pnpm workspaces + Turborepo |
| 构建工具 | Vite（应用 + 库均使用 Vite） |
| 后端框架 | Fastify v5 |
| 消息队列 | Redis + BullMQ |
| 数据库 | PostgreSQL 17 + Drizzle ORM |
| 对象存储 | MinIO (开发) / S3 (生产) |
| 前端 | React 19 + Shadcn/ui + TailwindCSS v4 |
| AI | Anthropic Claude / OpenAI GPT（Provider 抽象层） |
| 图表 | ECharts |

## 项目结构

```
├── CLAUDE.md                 # 项目入口文档（本文件）
├── .claude/                  # Claude Code 配置
│   ├── rules/                #   自动加载的规则
│   │   ├── coding.md         #     代码规范
│   │   ├── architecture.md   #     架构规则
│   │   └── review.md         #     审查规则
│   └── skills/               #   可复用 Skills（/skill-name 调用）
│       ├── spec-breakdown/   #     /spec-breakdown — 需求拆解
│       ├── solution-design/  #     /solution-design — 方案设计
│       └── code-review/      #     /code-review — 代码审查
├── docs/                     # 项目文档
│   ├── requirements.md       #   需求文档
│   ├── SPEC.md               #   技术规格
│   ├── ARCHITECTURE.md       #   系统架构
│   ├── DESIGN.md             #   技术设计
│   └── tasks/CURRENT.md      #   任务跟踪
├── packages/                 # 公共库
│   ├── sdk/                  #   @g-heal-claw/sdk — 浏览器 SDK
│   ├── cli/                  #   @g-heal-claw/cli — Sourcemap 上传 CLI
│   ├── shared/               #   @g-heal-claw/shared — 共享类型/Schema/工具
│   ├── vite-plugin/          #   @g-heal-claw/vite-plugin
│   └── webpack-plugin/       #   @g-heal-claw/webpack-plugin
├── apps/                     # 后端服务 & 前端
│   ├── gateway/              #   数据采集网关（Fastify）
│   ├── error-processor/      #   错误处理 Worker（BullMQ）
│   ├── sourcemap-service/    #   Sourcemap 存储 & 解析
│   ├── ai-engine/            #   AI 诊断 & 修复生成
│   ├── notification-service/ #   通知分发
│   ├── auto-fix-worker/      #   自动修复管线
│   ├── dashboard-api/        #   后台管理 REST API
│   └── dashboard-web/        #   后台管理前端（React SPA）
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

> 详细架构设计见 `docs/ARCHITECTURE.md`

## 编码规范

### 核心规则

1. API 入参/出参必须 Zod Schema 定义，禁止裸类型
2. `packages/shared` 仅含纯类型定义 + Zod Schema + 无副作用工具函数
3. 禁止 `any` / `@ts-ignore` / 硬编码密钥
4. 环境变量统一由 Zod Schema 校验，启动时验证完整性
5. 代码注释和项目文档统一使用中文
6. **禁止自动提交 Git** — 不主动执行 git commit/push，由用户手动触发

### 架构约束

> 详见 `.claude/rules/architecture.md`（服务边界、通信规则、扩展检查清单）

### 代码规范

> 详见 `.claude/rules/coding.md`（TypeScript、Zod、命名、模块结构、错误处理）

### 审查规则

> 详见 `.claude/rules/review.md`（类型安全、架构合规、安全、代码质量 checklist）

### 开发流程

1. 查阅 `docs/tasks/CURRENT.md` 确认当前任务和优先级
2. 查阅 `docs/SPEC.md`（接口契约）+ `docs/ARCHITECTURE.md`（技术约束）+ `docs/DESIGN.md`（设计模式）
3. 编写代码 → 遵循 `.claude/rules/coding.md`
4. 更新 `docs/tasks/CURRENT.md` 任务状态

## 常用命令

```bash
# 安装依赖
pnpm install

# 启动基础设施（PostgreSQL + Redis + MinIO）
docker compose up -d

# 启动所有服务（开发模式）
pnpm dev

# 构建所有包
pnpm build

# 格式化
pnpm format
```
