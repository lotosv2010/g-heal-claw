# @g-heal-claw/ai-agent

AI 诊断与自愈 Agent —— 消费 BullMQ 队列，通过 LangChain ReAct 循环自动诊断异常 Issue 并生成修复 PR。

## 架构定位

```
Dashboard「一键自愈」
  → POST /api/v1/projects/:id/issues/:id/heal
    → HealModule 写入 heal_jobs + 入队 ai-diagnosis
      → 本应用消费 ai-diagnosis 队列
        → LangChain Agent 多步推理（5 Tools）
          → 完成后投递 ai-heal-fix 队列
            → Server HealResultWorker 回写终态
```

本应用是独立 Node.js 进程，**不依赖 NestJS**，仅通过 BullMQ 与 Server 通信（ADR-0036）。

## LLM Provider

通过 `LLM_PROVIDER` 环境变量切换模型，支持 6 种：

| Provider | 协议 | 说明 |
|----------|------|------|
| `deepseek` | DeepSeek API | 默认，性价比高 |
| `deepseek-reasoner` | DeepSeek API | 推理增强模型 |
| `gemini` | Google AI | Gemini 系列 |
| `moonshot` | OpenAI 兼容 | Kimi |
| `minimax` | Anthropic 兼容 | MiniMax |
| `ollama` | Ollama | 本地部署，无需 API Key |

## Agent Tools

| Tool | 功能 |
|------|------|
| `readIssue` | 从数据库读取 Issue 上下文（堆栈、面包屑、近期事件） |
| `readFile` | 从克隆仓库读取源码（限 500 行，白名单校验） |
| `grepRepo` | 在仓库内搜索代码模式（限 50 条） |
| `writePatch` | 写入修复文件（校验 `AI_MAX_PATCH_LOC` 行数限制） |
| `createPr` | 推送分支并创建 GitHub PR |

## 护栏

- `AI_MAX_STEPS=20` — 超出步数强制终止
- `AI_MAX_PATCH_LOC=100` — 单次修复最大变更行数
- `.ghealclaw.yml` `paths` / `forbidden` — 仓库路径白/黑名单

## 本地开发

```bash
# 前置：启动基础设施 + Server
docker compose up -d
pnpm -F @g-heal-claw/server dev

# 配置（至少填一个 LLM Provider 的 API Key）
cp .env.example .env
# 编辑 .env: LLM_PROVIDER=deepseek, DEEPSEEK_API_KEY=sk-xxx

# 启动 Agent
pnpm -F @g-heal-claw/ai-agent dev
```

## 命令

```bash
pnpm dev        # tsx watch 开发模式
pnpm build      # tsc 编译到 dist/
pnpm start      # 生产运行 dist/main.js
pnpm typecheck  # 类型检查
pnpm test       # Vitest 单测
```

## 相关文档

- [ADR-0036](../../docs/decisions/0036-ai-heal-agent-mvp.md) — AI 自愈 Agent MVP 决策
- [DESIGN §8](../../docs/DESIGN.md) — AI Agent 设计（Prompt / ReAct / 沙箱）
- [ARCHITECTURE §4.4](../../docs/ARCHITECTURE.md) — 自愈流程数据流
