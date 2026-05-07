# ADR-0036: AI 自愈 Agent MVP（Phase 5 · M5.1 + M5.2）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-05-07 |
| 决策人 | @Robin |

## 背景

Phase 1~4 已完成：SDK 异常采集 → 服务端聚合 Issue → 告警通知。目前开发者收到告警后仍需手动定位根因、编写修复代码、提交 PR。Phase 5 的目标是实现「一键自愈」：从 Issue 详情页触发 AI 诊断，自动生成修复 patch 并创建 PR，形成从告警到修复的闭环。

已就绪的前置条件：
- `packages/shared` 已定义 `AiAgentEnvSchema`、`QueueName.AiDiagnosis/AiHealFix`
- `DESIGN.md §8` 已设计 ReAct 循环、诊断 Prompt、沙箱验证
- `ARCHITECTURE.md §4.4` 已定义 server ↔ ai-agent 数据流

## 决策

### 总体方案

采用「轻量独立进程 + BullMQ 通信 + LangChain ReAct」架构：

1. **apps/ai-agent** — 纯 Node.js 进程（无框架），消费 `ai-diagnosis` 队列，LangChain AgentExecutor 驱动 ReAct 循环
2. **apps/server/modules/heal** — HealModule（NestJS），管理 `heal_jobs` 生命周期，消费 `ai-heal-fix` 结果队列
3. **状态同步** — 仅通过 BullMQ 双向队列，agent 不直接写数据库

### 关键技术选择

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Agent 框架 | 无框架（纯 Node.js + BullMQ Worker） | 轻量、无 NestJS 耦合、冷启动快 |
| AI 框架 | LangChain.js (@langchain/core + @langchain/anthropic + @langchain/openai) | 成熟 ReAct 实现、Tool 抽象、模型切换 |
| 主模型 | Claude Opus 4.7 | 编码能力最强、长上下文 |
| 备用模型 | GPT-4o | Anthropic 不可用时降级 |
| 仓库操作 | simple-git + 临时目录 clone | 比 GitHub API 直接操作灵活，支持 grep/read |
| PR 创建 | @octokit/rest (GitHub) / 预留 GitLab API | 主流平台覆盖 |
| 沙箱验证 | Docker SDK (dockerode) | 只读 mount + 网络隔离 + 超时控制 |
| Agent → Server 回写 | BullMQ `ai-heal-fix` 队列 | 保持架构红线（apps 间不直接通信） |

### MVP 范围（本期）

| 包含 | 不包含（后续迭代） |
|------|-------------------|
| `apps/ai-agent` 脚手架 + BullMQ 消费 | GitLab 集成（仅 GitHub） |
| 模型封装（Anthropic 主 + OpenAI 备） | Prompt caching 优化 |
| 5 核心 Tool（readIssue/readFile/grepRepo/writePatch/createPr） | runSandbox（Docker 沙箱 — 下一迭代） |
| ReAct 循环 + 步数/LOC 护栏 + trace | Web Heal 任务中心 UI |
| `heal_jobs` 表 + 状态机 | 回归数据集（T5.4） |
| HealModule API（触发/查询/取消） | 自动触发（仅手动触发） |
| HealResultWorker（回写终态） | 安全审计（T5.4.3） |

### 数据模型

```sql
CREATE TABLE heal_jobs (
  id            VARCHAR(32) PRIMARY KEY,     -- heal_xxx
  project_id    VARCHAR(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  issue_id      VARCHAR(32) NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  triggered_by  VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'queued',
  repo_url      TEXT NOT NULL,
  branch        VARCHAR(128) NOT NULL DEFAULT 'main',
  diagnosis     TEXT,
  patch         TEXT,
  pr_url        TEXT,
  error_message TEXT,
  trace         JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX heal_jobs_project_idx ON heal_jobs(project_id);
CREATE INDEX heal_jobs_issue_idx ON heal_jobs(issue_id);
CREATE INDEX heal_jobs_status_idx ON heal_jobs(status);
```

状态机转换：
```
queued → diagnosing → patching → (verifying) → pr_created
   ↘                    ↘            ↘
    failed              failed       failed
```

### API 端点

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/v1/projects/:projectId/issues/:issueId/heal` | 触发自愈 |
| GET | `/api/v1/projects/:projectId/heal` | 列表查询（分页+状态筛选） |
| GET | `/api/v1/projects/:projectId/heal/:healJobId` | 任务详情 |
| DELETE | `/api/v1/projects/:projectId/heal/:healJobId` | 取消（仅 queued 状态可取消） |

### Agent Tools（MVP 5 个）

| Tool | 输入 | 输出 | 说明 |
|------|------|------|------|
| `readIssue` | issueId | title + stack + breadcrumbs + recent events | 从 DB 读取 issue 上下文 |
| `readFile` | filePath | 文件内容（限 500 行） | 从克隆仓库读源码 |
| `grepRepo` | pattern, options | 匹配行（限 50 条） | 在仓库内搜索 |
| `writePatch` | filePath, diff | success/failure | 生成 unified diff，校验 LOC 限制 |
| `createPr` | title, body, branch | PR URL | 推送分支 + 创建 PR |

### 护栏机制

- `AI_MAX_STEPS`（默认 20）— 超出强制终止，状态 → failed
- `AI_MAX_PATCH_LOC`（默认 100）— writePatch 校验超限拒绝
- `.ghealclaw.yml` paths/forbidden — 白名单外路径拒绝 readFile/writePatch
- trace 全量记录 — 每个 Thought/Action/Observation 写入 `heal_jobs.trace`

## 备选方案

### 方案 B：Agent 内嵌 NestJS

将 ai-agent 作为 server 的一个 Module（带独立 Worker 进程模式）。

**优点**：共享 DI、TypeORM/Drizzle 直连。
**缺点**：违反架构红线（apps 间不直接引用）；Agent 和 Server 耦合导致独立部署、扩缩容受限；LangChain 的 Tool 模式与 NestJS DI 不自然融合。

### 方案 C：HTTP 回调代替 BullMQ

Agent 完成后 HTTP POST 回调 server。

**优点**：实现简单。
**缺点**：Agent 需知道 server 地址（增加配置）；重试/幂等需自行处理；与现有 BullMQ 模式不一致。

## 影响

- **新增应用**：`apps/ai-agent`（package.json + tsconfig + src/）
- **新增模块**：`apps/server/src/modules/heal/`
- **新增表**：`heal_jobs`（需要 DDL migration 0010）
- **SPEC 影响**：新增 §7 Heal API 端点契约
- **ARCHITECTURE 影响**：§4.4 从「规划」改为「已实现」；§6 ai-agent 从「规划」改为「已实现」
- **依赖新增**：ai-agent 引入 `@langchain/*`, `simple-git`, `@octokit/rest`, `dockerode`（沙箱后续）

## 后续

- T5.3.1 Docker 沙箱验证（下一迭代，本期 MVP 跳过 verify 阶段直接 PR）
- T5.3.2 GitLab PAT 集成
- T5.3.4 Web Heal 任务中心 UI
- T5.4 质量验证（回归数据集 + 安全审计）
- Prompt caching 优化（积累调用数据后评估）
- Demo 路径：`examples/nextjs-demo/` 暂不涉及（heal 操作需要真实仓库 + GitHub 凭证）
- 使用文档：`apps/docs/docs/guide/settings/ai.md` + `apps/docs/docs/reference/heal-api.md`
