# AGENTS.md — 通用 AI 开发规范

> 面向所有 AI 编程助手（Claude Code / Cursor / Aider / Codex / Cline / Copilot Chat / Windsurf 等）共同遵守的开发规范。
> 遵循 [AGENTS.md 约定](https://agents.md/)，是团队与 AI 协作的单一事实来源。
> 工具专属配置（如 Claude Code 的 `.claude/`）见各自入口文件。

## 1. 核心原则

### 1.1 先理解，再动手

```
正确：读契约 → 理解架构 → 确认方案 → 编码 → 验证 → 更新任务
错误：直接开写 → 遇到问题 → 推倒重来
```

动笔前**必须**：
1. 按 **PRD → SPEC → ARCHITECTURE → DESIGN** 顺序读契约
2. 查阅相关 `docs/decisions/` ADR（已有决策不推翻）
3. 查阅 `docs/tasks/CURRENT.md`（任务编号、依赖、冲突）
4. 识别受影响的模块、队列、数据表、对外契约
5. 用 Read / Grep / Glob 理解现有模式

### 1.2 最小变更

- 只修改任务所需最少文件；不做"顺便"的重构
- 不引入当前不需要的依赖
- 不改变现有代码行为，除非任务就是改它

### 1.3 可验证性

- 每个变更可测试（测试随功能同步，不单独拆"补测试"任务）
- 每个决策可追溯（ADR 或注释说明原因）
- 每个新增模式有使用示例

## 2. 文档层级

**PRD（什么）→ SPEC（契约）→ ARCHITECTURE（拓扑）→ DESIGN（为什么）**

| 文档 | 回答的问题 | 路径 |
|---|---|---|
| PRD | 要做什么、验收标准 | `docs/PRD.md` |
| SPEC | 接口 / 数据模型 / 协议契约 | `docs/SPEC.md` |
| ARCHITECTURE | 模块边界、数据流、部署拓扑 | `docs/ARCHITECTURE.md` |
| DESIGN | 选型理由、设计模式、横切方案 | `docs/DESIGN.md` |
| Decisions | 重要决策记录（ADR 格式） | `docs/decisions/` |
| Tasks | 当前迭代任务与优先级 | `docs/tasks/CURRENT.md` |

项目定位、技术栈、目录结构见 [`README.md`](./README.md)。本地环境与接入链路见 [`GETTING_STARTED.md`](./GETTING_STARTED.md)。

## 3. 硬性规则（下沉到 `.claude/rules/`）

Claude Code 会自动加载；其他 AI 工具请显式读取：

| 规则文件 | 覆盖范围 |
|---|---|
| [`.claude/rules/architecture.md`](./.claude/rules/architecture.md) | 架构红线、模块边界、包依赖、新增模块/包检查清单 |
| [`.claude/rules/coding.md`](./.claude/rules/coding.md) | TypeScript、Zod、NestJS、命名约定、错误处理、测试标准 |
| [`.claude/rules/review.md`](./.claude/rules/review.md) | 提交前自检 Checklist |

**最常违反的红线**（完整版见 `architecture.md`）：

1. `apps/*` 禁止互相 import，通过 `packages/shared` + BullMQ 通信
2. 所有外部事件必须经 `GatewayModule` 鉴权 + 限流，禁止绕过直写 DB
3. `packages/shared` 仅允许 zod，禁止 nestjs / react / langchain 等运行时框架
4. `packages/sdk` 禁止 Node.js API，必须浏览器兼容
5. 禁止循环依赖；模块间通信走 DI 注入 Service，异步走 BullMQ

## 4. 开发工作流

AI 接到任务后的标准动作：

1. **读任务** — `docs/tasks/CURRENT.md` 确认编号、依赖、优先级
2. **读契约** — PRD → SPEC → ARCHITECTURE → DESIGN 顺序
3. **先读后写** — Read / Grep / Glob 理解现有代码
4. **遵循规则** — 严守 `.claude/rules/*` 所有约束
5. **小步验证** — 每次改动后 `pnpm typecheck && pnpm lint && pnpm test`
6. **自检** — 对照 `.claude/rules/review.md` 的 Checklist
7. **更新任务** — `docs/tasks/CURRENT.md` 状态标记 `[x]`
8. **不自动提交** — 改动交用户评审后手动 `git commit`

## 5. 安全规则

- **禁止**提交 `.env*` 或任何含密钥文件
- **禁止**在代码中硬编码密钥 / Token / API Key / URL / 魔法数字
- **禁止**未经确认执行破坏性操作（删文件、改 CI、升级依赖、迁移回滚）
- **禁止**绕过 pre-commit 钩子（`--no-verify` 等）
- **禁止自动**执行 `git commit` / `git push` / 分支操作
- 用户输入必须校验（Zod Schema / NestJS Pipe）
- DSN `publicKey` 不含 secret；`secretKey` 仅用于后台上传

## 6. Git 规范

### 提交消息（Conventional Commits）

格式：`<type>(<scope>): <description>`

```
feat(sdk):        添加 ExposurePlugin 曝光埋点
fix(gateway):     修复 DSN 鉴权缓存失效
refactor(heal):   抽取 Sandbox 运行时配置
docs(arch):       更新 BullMQ 队列清单
test(processor):  补充 ErrorProcessor 指纹边界用例
chore(deps):      升级 drizzle-orm 至 0.30.x
```

### 分支策略

```
main      ← 稳定版本，受保护
feat/*    ← 功能分支
fix/*     ← 修复分支
chore/*   ← 杂项
```

## 7. AI 工具适配

| 工具 | 配置位置 | 说明 |
|---|---|---|
| Claude Code | `CLAUDE.md` + `.claude/rules/*` + `.claude/skills/*` | 引用本文件 + 自动加载规则 |
| Cursor | `.cursor/rules/` 或 `.cursorrules` | 可软链接到本文件 |
| Aider | `.aider.conf.yml` 的 `read` 字段指向本文件 | — |
| Codex CLI | 默认读取 `AGENTS.md` | 无需额外配置 |
| GitHub Copilot | `.github/copilot-instructions.md` | 可引用本文件 |
| Windsurf | `.windsurfrules` | 可引用本文件 |

## 8. 更新守则

- 本文件是 AI 指令基线；普适规则先改这里，工具专属再写到各自配置
- 技术决策写入 `docs/decisions/`，不在本文件展开
- 任务状态写入 `docs/tasks/CURRENT.md`，不在本文件累积
- 需求变更先写 `docs/PRD.md`，再更新契约层文档
- 项目介绍 / 技术栈 / 目录结构的事实更新在 `README.md`，本文件只引用
