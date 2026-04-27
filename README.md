# g-heal-claw

前端可观测 + AI 自愈修复平台。SDK 采集 Web/H5/小程序的性能、异常、API、资源、页面、埋点数据 → 后端聚合 → 可视化面板 → 告警 → AI Agent 诊断并生成修复 PR。

> 状态：**Phase 1 开发中**。仓库当前为 Monorepo 脚手架 + 基础设施 Compose；`apps/*` 与 `packages/*` 子包尚未初始化。路线图见 [`docs/tasks/CURRENT.md`](docs/tasks/CURRENT.md)。

## 能力范围

来自 [`docs/PRD.md`](docs/PRD.md)：

- **性能监控** — Core Web Vitals（LCP / FCP / CLS / INP / TTFB）、页面加载各阶段耗时、首屏时间、长任务卡顿、加载瀑布图。
- **异常监控** — JS 运行时错误、Promise 未处理拒绝、静态资源加载失败、AJAX/Fetch 异常、白屏检测、Source Map 源码位置还原。
- **API 监控** — 自动拦截 XHR / fetch，记录调用量、成功率、耗时分位（p50/p90/p95/p99）、慢请求、异常请求上下文、TraceID 前后端串联。
- **访问分析** — PV/UV、会话轨迹、访问来源（referrer / UTM / 搜索引擎）、终端环境、IP 地域分布。
- **资源监控** — 按类型（script / style / image / font / media）拆分的加载耗时、大小、CDN 测速、失败率。
- **自定义上报** — `track` / `time` / `log` 事件、全局属性、分级日志。
- **埋点** — 代码埋点、`data-track` 全埋点、曝光埋点（IntersectionObserver）、页面停留时长。
- **告警** — 错误率突增、Web Vital 劣化、API 成功率下降等预置规则；通过邮件 / 钉钉 / 企微 / Slack / Webhook / 短信分发。
- **AI 自愈** — LangChain Agent 基于 Issue + Sourcemap + 仓库上下文 ReAct 推理，在 Docker 沙箱生成 patch + 跑 verify + 创建 PR。

## 文档层级

**PRD（什么）→ SPEC（契约）→ ARCHITECTURE（拓扑）→ DESIGN（为什么）**

| 文档 | 说明 |
|---|---|
| [PRD.md](docs/PRD.md) | 需求规格说明书 — 功能需求与非功能需求 |
| [SPEC.md](docs/SPEC.md) | 技术规格说明书 — SDK API、HTTP 契约、数据模型、告警 DSL |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系统架构 — 模块拓扑、队列清单、数据流 |
| [DESIGN.md](docs/DESIGN.md) | 技术设计 — 选型理由、设计模式、横切方案 |
| [decisions/](docs/decisions/) | 决策记录（ADR 格式） |
| [tasks/CURRENT.md](docs/tasks/CURRENT.md) | 任务跟踪 — 6 Phase 路线图 |
| [AGENTS.md](AGENTS.md) | AI 编码助手通用指南 |
| [CLAUDE.md](CLAUDE.md) | Claude Code 专属补充 |

## 项目结构

```
g-heal-claw/
├── AGENTS.md                # AI 编码助手通用指南
├── CLAUDE.md                # Claude Code 专属补充
├── docker-compose.yml       # PostgreSQL 17 + Redis 7 + MinIO
├── .env.example             # 环境变量模板
├── packages/                # 公共库（待初始化）
│   ├── sdk/                 #   @g-heal-claw/sdk — 浏览器 SDK
│   ├── cli/                 #   @g-heal-claw/cli — Sourcemap 上传 CLI
│   ├── shared/              #   @g-heal-claw/shared — Zod Schema / 队列名 / 工具
│   └── vite-plugin/         #   @g-heal-claw/vite-plugin — 构建期上传钩子
├── apps/                    # 应用（待初始化）
│   ├── server/              #   NestJS 后端（模块化单体，Fastify）
│   ├── web/                 #   Next.js 管理面板（App Router + SSR）
│   └── ai-agent/            #   LangChain AI Agent（诊断 + 修复）
├── docs/
│   ├── PRD.md
│   ├── SPEC.md
│   ├── ARCHITECTURE.md
│   ├── DESIGN.md
│   ├── decisions/
│   └── tasks/CURRENT.md
└── .claude/                 # Claude Code 配置（rules + skills）
```

## 技术栈

| 类别 | 选型 |
|---|---|
| 语言 | TypeScript (strict) + Zod |
| Monorepo | pnpm workspaces + Turborepo |
| 后端 | NestJS (Fastify adapter) + BullMQ |
| 数据库 | PostgreSQL 17 + Drizzle ORM |
| 缓存 / 队列 | Redis 7 |
| 对象存储 | MinIO（开发） / S3（生产） |
| 前端 | Next.js (App Router) + Shadcn/ui + TailwindCSS v4 |
| AI | LangChain Agent + Claude Opus 4.7（主） / GPT-4.x（备） |
| 图表 | ECharts |

选型理由见 [`docs/DESIGN.md §2`](docs/DESIGN.md)。

## 快速开始

前置要求：Node.js ≥ 22、pnpm 10、Docker Desktop。

```bash
# 1. 安装依赖
pnpm install

# 2. 启动基础设施（PostgreSQL + Redis + MinIO）
docker compose up -d

# 3. 复制环境变量模板并按需填写
cp .env.example .env

# 4. 开发模式（Phase 1 子包就绪后可用）
pnpm dev
```

## 常用命令

```bash
pnpm dev              # Turbo 并行启动 apps 与 packages 的 dev
pnpm build            # 全量构建（依赖拓扑有序）
pnpm lint             # Lint 全部
pnpm test             # 运行测试
pnpm typecheck        # 类型检查
pnpm format           # Prettier 写入
pnpm format:check     # Prettier 检查
```

## 贡献指引

- 遵守 [`AGENTS.md`](AGENTS.md) 的编码规则与架构红线。
- 任务状态更新写入 [`docs/tasks/CURRENT.md`](docs/tasks/CURRENT.md)。
- 重要技术决策在 [`docs/decisions/`](docs/decisions/) 新增 ADR 文件。
- 提交前自检：`pnpm typecheck && pnpm lint && pnpm test`。
- 禁止自动 `git commit` / `git push`，由维护者手动触发。
