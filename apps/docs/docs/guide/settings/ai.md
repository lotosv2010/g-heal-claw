# AI 修复配置

路径：系统设置 → **AI 修复配置** `/settings/ai`

## 概述

AI 自愈功能（ADR-0036）可自动诊断生产异常并生成修复 PR。配置分为三层：

1. **平台配置**（环境变量）— LLM Provider、步数限制
2. **项目配置**（Dashboard UI）— 触发策略、白名单
3. **仓库配置**（`.ghealclaw.yml`）— 路径约束、LOC 限制

## 环境变量

在 `apps/ai-agent` 的 `.env` 中配置：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `LLM_PROVIDER` | 模型提供商标识 | `deepseek` |
| `AI_MAX_STEPS` | Agent 最大推理步数 | `20` |
| `AI_AGENT_PORT` | Agent 服务端口 | `3300` |

### LLM Provider 配置

支持 6 种 Provider，按 `LLM_PROVIDER` 选择：

| Provider | 协议 | 所需环境变量 |
|---|---|---|
| `deepseek` | DeepSeek | `DEEPSEEK_API_KEY` + `DEEPSEEK_BASE_URL` + `DEEPSEEK_MODEL` |
| `deepseek-reasoner` | DeepSeek | 同上 + `DEEPSEEK_REASONER_MODEL` |
| `gemini` | Google | `GEMINI_API_KEY` + `GEMINI_MODEL` |
| `moonshot` | OpenAI 兼容 | `MOONSHOT_API_KEY` + `MOONSHOT_BASE_URL` + `MOONSHOT_MODEL` |
| `minimax` | Anthropic 兼容 | `MINIMAX_API_KEY` + `MINIMAX_BASE_URL` + `MINIMAX_MODEL` |
| `ollama` | Ollama (本地) | `OLLAMA_BASE_URL` + `OLLAMA_MODEL` |

## 自愈策略

| 模式 | 行为 |
|---|---|
| **仅诊断** | AI 生成诊断报告，不创建 PR |
| **自动 PR（默认）** | 符合白名单的 Issue → 自动 PR 到指定分支 |
| **需人工确认** | AI 产出方案，等待人工点击「生成 PR」 |

## 触发阈值

| 条件 | 默认 | 说明 |
|---|---|---|
| 影响用户数 | ≥ 10 | 仅为真实用户规模的 Issue 触发 AI |
| 出现次数 | ≥ 50 | 避免长尾低频问题消耗配额 |
| 首次出现 > | 5 分钟 | 给前置告警留反应时间 |
| 已存在未解决 PR | 跳过 | 避免重复 PR |

## 仓库配置文件 `.ghealclaw.yml`

在项目仓库根目录放置此文件，限制 AI Agent 的操作范围：

```yaml
heal:
  maxLoc: 50         # 单次修复最大变更行数
  paths:             # 允许修改的路径白名单（glob）
    - src/**
    - lib/**
  forbidden:         # 禁止修改的路径
    - node_modules/**
    - dist/**
    - "*.lock"
```

| 字段 | 说明 | 默认值 |
|---|---|---|
| `maxLoc` | 单次修复最大变更行数 | `50` |
| `paths` | 允许修改的路径白名单 | `["src/**"]` |
| `forbidden` | 禁止修改的路径 | `[]` |

未配置此文件时，Agent 默认允许 `src/**` 下的文件，最大 50 行变更。

## 白名单 / 黑名单

- **文件白名单**：通过 `.ghealclaw.yml` 的 `paths` 字段控制
- **Issue 指纹黑名单**：在 Dashboard AI 设置中配置，明确跳过的历史问题（如第三方 SDK 已知 bug）

## API 接口

详见 [Heal API 参考](/reference/heal-api)。

## 安全说明

- 所有修复均为 AI 自动生成，PR 需人工 Review 后合并
- API Key 使用 AES-256 加密存储
- Agent 运行在独立进程，通过 BullMQ 队列与 Server 通信
- 仓库操作通过 GitHub App 权限控制，遵循最小权限原则
