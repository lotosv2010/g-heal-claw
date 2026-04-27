# CLAUDE.md — Claude Code 专属配置

> Claude Code 在本项目的入口文件，自动加载。
> **通用规范见 [`AGENTS.md`](./AGENTS.md)**；本文件仅保留 Claude Code 特有能力与行为指令。

## 语言规则

- 本项目所有回复、文档、注释统一使用**中文**（覆盖全局英文偏好设置）

## 项目概述

项目背景、技术栈、目录结构见 [`README.md`](./README.md)；文档层级与契约见 [`AGENTS.md §2`](./AGENTS.md)。

## 自动加载规则

Claude Code 通过 `.claude/` 机制自动加载，**无需在 `AGENTS.md` 重复**：

| 文件 | 内容 |
|---|---|
| [`.claude/rules/architecture.md`](./.claude/rules/architecture.md) | 架构红线、模块边界、扩展检查清单 |
| [`.claude/rules/coding.md`](./.claude/rules/coding.md) | TypeScript、Zod、NestJS、命名、错误处理、测试 |
| [`.claude/rules/review.md`](./.claude/rules/review.md) | 提交前自检 Checklist |

## Claude Code Skills（斜杠命令）

| 命令 | 用途 |
|---|---|
| `/feat <需求>` | 端到端需求交付：理解 → ADR → 任务拆解 → 逐任务实现，每阶段卡点等用户确认 |
| `/spec-breakdown <需求>` | 将需求拆解为结构化用户场景 + 任务清单 |
| `/solution-design <任务>` | 基于任务清单输出技术方案（模块划分 / 接口契约 / 数据流 / 文件清单） |
| `/code-review` | 对当前变更执行结构化代码审查 |

Skill 定义见 `.claude/skills/*/SKILL.md`。

## 上下文读取顺序

每次执行任务前按序读取：

1. `CLAUDE.md`（本文件）
2. `AGENTS.md`（通用规范）
3. `.claude/rules/*.md`（自动加载规则）
4. 相关 `docs/decisions/*.md`（架构决策）
5. `docs/tasks/CURRENT.md`（活跃任务）

## 工具选择

- 优先 Claude Code 原生工具：**Read / Glob / Grep / Edit / Write**
- 避免用 Bash 调用 `cat` / `grep` / `find` / `sed` / `awk` / `echo`（专用工具体验更好）
- 多步任务用 `TaskCreate` / `TaskUpdate` 跟踪
- 独立子任务并行化，主动使用 `Agent` 调用 subagent（如 `general-purpose` / `Explore`）

## 安全约束

- 禁止读取或输出 `.env*` 文件内容
- 破坏性操作（删文件、批量修改、改 CI、升级依赖）**必须先确认**
- **禁止自动**执行 `git commit` / `git push` / 分支操作
- 架构红线冲突立即暂停并告知用户
- 其余安全规则见 [`AGENTS.md §5`](./AGENTS.md)

## 常用命令

```bash
pnpm install              # 安装依赖
docker compose up -d      # 启动基础设施（PostgreSQL + Redis + MinIO）
pnpm dev                  # 启动所有应用（开发模式）
pnpm build                # 构建所有包
pnpm test                 # 运行测试
pnpm typecheck            # 类型检查
pnpm lint                 # Lint 全部
pnpm format               # Prettier 格式化
```

## 文件分工

| 项 | 面向 | 特点 |
|---|---|---|
| `README.md` | 人类 + AI | 项目介绍、技术栈、目录结构、快速上手入口 |
| `GETTING_STARTED.md` | 开发者 | 本地环境搭建、SDK 接入、AI 自愈 PR 工作流 |
| `AGENTS.md` | 所有 AI 工具 | 工具无关的原则、工作流、安全规则、Git 规范 |
| `CLAUDE.md`（本文件） | 仅 Claude Code | 语言偏好、Skills、工具选择、上下文顺序 |
| `.claude/rules/` | 仅 Claude Code | 自动加载的硬性规则（架构 / 编码 / 审查） |
| `.claude/skills/` | 仅 Claude Code | 斜杠命令驱动的交付流程 |
| `docs/PRD.md` ~ `DESIGN.md` | 人类 + AI | 需求 / 契约 / 架构 / 设计四层 |
| `docs/decisions/` | 人类 + AI | ADR 格式的决策记录 |
| `docs/tasks/CURRENT.md` | 人类 + AI | 任务跟踪（6 Phase 路线图） |
