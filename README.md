# g-heal-claw

自愈式生产监控系统。捕获前端错误 → Sourcemap 还原堆栈 → AI Agent 诊断根因 → 自动生成修复 PR。

## 功能

- **错误监控** — 轻量 SDK 捕获异常、面包屑、上下文，批量上报
- **堆栈还原** — 自动匹配 Sourcemap，将压缩后的堆栈还原为源码位置
- **AI 诊断** — LangChain Agent 多步推理分析错误根因，输出 Markdown 解决方案
- **自动修复** — AI 生成代码补丁 → 沙箱验证 → 创建 PR → 人工审批 → 触发部署
- **多渠道通知** — 邮件 / Slack / 钉钉 / Webhook 实时告警
- **可视化面板** — 异常管理、趋势图表、版本对比、团队协作

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动基础设施

```bash
docker compose up -d
```

启动 PostgreSQL、Redis、MinIO。

### 3. 配置环境变量

```bash
cp .env.example .env
```

### 4. 开发

```bash
pnpm dev
```

## 项目结构

```
g-heal-claw/
├── packages/              # 公共库（可发布）
│   ├── sdk/               #   @g-heal-claw/sdk — 浏览器 SDK
│   ├── cli/               #   @g-heal-claw/cli — Sourcemap 上传 CLI
│   ├── shared/            #   @g-heal-claw/shared — 共享类型/Schema/工具
│   └── vite-plugin/       #   @g-heal-claw/vite-plugin
├── apps/                  # 应用
│   ├── server/            #   NestJS 后端（模块化单体）
│   ├── web/               #   Next.js 管理面板（SSR）
│   └── ai-agent/          #   LangChain AI Agent（诊断 + 修复）
├── docs/                  # 项目文档
│   ├── SPEC.md            #   技术规格
│   ├── ARCHITECTURE.md    #   系统架构
│   ├── DESIGN.md          #   技术设计
│   └── tasks/CURRENT.md   #   任务跟踪
└── .claude/               # Claude Code 配置
    ├── rules/             #   自动加载的规则
    └── skills/            #   可复用 Skills
```

## 技术栈

| 类别 | 选型 |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| 语言 | TypeScript (strict) |
| 后端 | NestJS (Fastify adapter) + BullMQ |
| 数据库 | PostgreSQL + Drizzle ORM |
| 缓存/队列 | Redis |
| 对象存储 | MinIO (开发) / S3 (生产) |
| 前端 | Next.js (App Router) + Shadcn/ui + TailwindCSS v4 |
| AI | LangChain Agent + Claude/GPT |
| 图表 | ECharts |

## 文档

| 文档 | 说明 |
|---|---|
| [SPEC.md](docs/SPEC.md) | 技术规格（SDK 接口、API 契约、数据模型） |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系统架构（服务拓扑、数据流、基础设施） |
| [DESIGN.md](docs/DESIGN.md) | 技术设计（选型理由、设计模式、编码约定） |
| [CURRENT.md](docs/tasks/CURRENT.md) | 任务跟踪 |

## 常用命令

```bash
pnpm dev          # 启动所有服务（开发模式）
pnpm build        # 构建所有包
pnpm lint         # 代码检查
pnpm format       # 格式化
```
