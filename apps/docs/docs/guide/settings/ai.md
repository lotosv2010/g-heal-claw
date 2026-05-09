# AI 修复配置

路径：系统设置 → **AI 修复配置** `/settings/ai`

## 概述

AI 能力分为两大功能：

1. **AI 对话诊断** — 在右侧抽屉中与 AI 实时对话，分析异常/性能问题
2. **AI 自动修复** — 基于 Sourcemap 还原的堆栈，AI 自动生成修复 PR

## AI 对话

### 入口

- **全局入口**：顶部导航栏右侧 Bot 图标，打开 AI 对话抽屉
- **一键诊断**：Issues 列表/详情、性能指标、错误排行中的"AI 诊断"按钮
- **Web Vitals**：非绿色指标数值可直接点击调起 AI 分析

### 功能

| 功能 | 说明 |
|---|---|
| 多会话管理 | 新建、切换、删除对话，自动保存历史 |
| 流式回复 | AI 回答实时流式输出（SSE） |
| Markdown 渲染 | 代码高亮 + 表格 + 列表等完整 Markdown 支持 |
| 代码复制 | 代码块右上角一键复制 |
| 上下文注入 | 诊断按钮自动将 Issue/性能数据注入对话 |
| 思考过程折叠 | DeepSeek Reasoner 等模型的思考内容可展开查看 |

### 技术架构

```
前端 AiDrawer → Next.js /api/ai/chat → OpenAI SDK → LLM（DeepSeek/Moonshot/MiniMax/Gemini/Ollama）
     ↕
NestJS /api/v1/ai/conversations → PostgreSQL（会话 + 消息持久化）
```

## 自动修复配置

### 前提条件

1. 上传 Sourcemap 文件（设置 → Source Map）
2. 在本页面配置代码仓库地址和分支
3. 确保 LLM Provider 的 API Key 已配置

### Web UI 配置

在 `/settings/ai` 页面配置：

| 字段 | 说明 | 示例 |
|---|---|---|
| 仓库地址 | GitHub 仓库 HTTPS URL | `https://github.com/your-org/your-repo` |
| 默认分支 | 修复 PR 的目标分支 | `main` |

### 自动修复完整流程

```
1. Sourcemap 上传 → 错误发生时自动还原堆栈到源码位置
2. 用户在 Issue 详情或 AI 对话中点击「触发自动修复」
3. HealModule 创建任务 → BullMQ 投递到 ai-agent
4. AI Agent ReAct 循环：
   - readIssue → 读取还原后的堆栈
   - readFile → 读仓库源码文件
   - grepRepo → 搜索相关代码
   - writePatch → 生成 unified diff
   - createPr → push 分支 + 创建 GitHub PR
5. PR 创建完成，开发者审核合并
```

### 任务状态

在 `/settings/ai` 页面底部可查看修复任务列表：

| 状态 | 说明 |
|---|---|
| 排队中 | 等待 AI Agent 处理 |
| 诊断中 | Agent 正在分析异常 |
| 生成补丁 | Agent 正在编写修复代码 |
| 验证中 | 正在验证修复有效性 |
| PR 已创建 | 修复 PR 已提交到 GitHub |
| 失败 | 修复失败（可查看原因） |

## 环境变量

在 `.env.local` 中配置 LLM Provider：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `LLM_PROVIDER` | 模型提供商标识 | `deepseek` |
| `AI_MAX_STEPS` | Agent 最大推理步数 | `20` |
| `AI_MAX_PATCH_LOC` | 单次修复最大变更行数 | `50` |

### 支持的 LLM Provider

| Provider | 所需环境变量 | 默认模型 |
|---|---|---|
| `deepseek` | `DEEPSEEK_API_KEY` + `DEEPSEEK_BASE_URL` | `deepseek-chat` |
| `deepseek-reasoner` | 同上 + `DEEPSEEK_REASONER_MODEL` | `deepseek-reasoner` |
| `moonshot` | `MOONSHOT_API_KEY` + `MOONSHOT_BASE_URL` | `kimi-k2.5` |
| `minimax` | `MINIMAX_API_KEY` + `MINIMAX_BASE_URL` | `MiniMax-M2.7` |
| `gemini` | `GEMINI_API_KEY` | `gemini-3-flash-preview` |
| `ollama` | `OLLAMA_BASE_URL` | `qwen3.5:cloud` |

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

## 安全说明

- 所有修复均为 AI 自动生成，PR 需人工 Review 后合并
- LLM API Key 仅在服务端使用，不暴露给浏览器
- Agent 运行在独立进程，通过 BullMQ 队列与 Server 通信
- 仓库操作通过 GitHub App 权限控制，遵循最小权限原则
- AI 对话内容存储在项目数据库中，按用户隔离

## API 接口

详见 [Heal API 参考](/reference/heal-api)。

## 常见问题

### AI 对话无回复？
- 检查 `.env.local` 中 `LLM_PROVIDER` 对应的 API Key 是否配置
- 确认 Next.js 能读取到根目录的 `.env.local`

### 触发自动修复按钮灰显？
- 需要先在 `/settings/ai` 配置仓库地址
- 确认 Sourcemap 已上传且 Issue 有还原后的堆栈

### 生成的 PR 质量不佳？
- 确保 `.ghealclaw.yml` 配置了正确的路径白名单
- 使用更强的模型（如 `deepseek-reasoner`）可提升推理质量
- 增加 `AI_MAX_STEPS` 允许更多推理轮次
