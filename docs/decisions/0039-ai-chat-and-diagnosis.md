# ADR-0039: AI 对话交互 + 一键诊断 + Sourcemap 自动修复

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-05-08 |
| 决策人 | @gaowenbin |

## 背景

现有 AI 能力仅限于后台自动修复（`HealModule` + `apps/ai-agent`），用户无法在前端直接与 AI 交互。需要：

1. **全局 AI 对话抽屉**：用户可随时打开与 AI 对话，询问监控数据的含义、排查思路等
2. **一键 AI 方案**：在异常详情、性能瓶颈等页面，一键将当前上下文传给 AI 获取诊断建议
3. **Sourcemap 自动修复**：结合已上传的 Sourcemap 还原堆栈后，AI 定位根因并生成修复方案（复用 HealModule）

## 决策

### 架构分层

```
┌─────────────────────────────────────────────────────────┐
│  apps/web（前端）                                         │
│  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │ AiDrawer 抽屉     │  │ DiagnoseButton 一键诊断      │  │
│  │ · 会话列表         │  │ · 传入上下文（issue/perf）  │  │
│  │ · 消息面板(SSE)    │  │ · 调用 /ai/diagnose         │  │
│  │ · 新建/删除会话    │  │ · 结果显示在抽屉内          │  │
│  └──────────────────┘  └─────────────────────────────┘  │
└────────────────────────────┬────────────────────────────┘
                             │ HTTP + SSE
┌────────────────────────────▼────────────────────────────┐
│  apps/server · AiChatModule                              │
│  ┌─────────────────────────────────────────────────────┐│
│  │ AiChatController                                     ││
│  │  POST /api/v1/ai/conversations          (创建会话)   ││
│  │  GET  /api/v1/ai/conversations          (会话列表)   ││
│  │  DELETE /api/v1/ai/conversations/:id    (删除会话)   ││
│  │  POST /api/v1/ai/conversations/:id/messages (发消息) ││
│  │  GET  /api/v1/ai/conversations/:id/messages (历史)   ││
│  │  POST /api/v1/ai/diagnose              (一键诊断)    ││
│  └──────────────────────┬──────────────────────────────┘│
│                         │                                │
│  ┌──────────────────────▼──────────────────────────────┐│
│  │ AiChatService                                        ││
│  │  · 会话/消息 CRUD（Drizzle）                         ││
│  │  · LLM 流式调用（统一 provider 工厂）                ││
│  │  · 上下文注入（issue 堆栈 + sourcemap 还原结果）     ││
│  └──────────────────────┬──────────────────────────────┘│
│                         │                                │
│  ┌──────────────────────▼──────────────────────────────┐│
│  │ LlmProviderService（轻量封装）                       ││
│  │  · 复用 AiAgentEnvSchema 配置                        ││
│  │  · DeepSeek / OpenAI / Gemini / Ollama 多 provider  ││
│  │  · streamChat(messages): AsyncIterable<string>       ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
                             │
                             │ BullMQ（复杂修复场景）
                             ▼
                    apps/ai-agent（现有 HealModule）
```

### 数据模型

```sql
-- 会话表
CREATE TABLE ai_conversations (
  id          VARCHAR(32) PRIMARY KEY,  -- conv_xxx
  project_id  VARCHAR(32) NOT NULL REFERENCES projects(id),
  user_id     VARCHAR(32) NOT NULL REFERENCES users(id),
  title       VARCHAR(256) NOT NULL DEFAULT '新对话',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_conv_user ON ai_conversations(user_id, updated_at DESC);

-- 消息表
CREATE TABLE ai_messages (
  id              VARCHAR(32) PRIMARY KEY,  -- msg_xxx
  conversation_id VARCHAR(32) NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            VARCHAR(16) NOT NULL,  -- 'user' | 'assistant' | 'system'
  content         TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',  -- 可选：issue_id, performance_data 等上下文
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_msg_conv ON ai_messages(conversation_id, created_at);
```

### 前端交互

1. **AiDrawer**（右侧抽屉，全局可用）：
   - 左侧窄栏：会话列表 + 新建按钮
   - 右侧主区：消息流（markdown 渲染）+ 输入框
   - SSE 流式接收 AI 回复（逐字输出）
   - Topbar 右上角常驻 AI 图标入口

2. **DiagnoseButton**（嵌入各大盘页）：
   - 点击后自动创建新会话（或追加到当前会话）
   - 将页面上下文（issue 堆栈 / 性能数据 / 还原后源码）注入 system prompt
   - 打开抽屉展示 AI 诊断结果
   - 复杂修复场景下提供"触发自动修复"按钮（调用 HealModule）

### LLM 调用策略

- **普通对话**：直接 streamChat，无工具调用
- **一键诊断**：注入结构化上下文（JSON）到 system prompt，要求 AI 给出：根因分析 + 解决方案 + 代码示例
- **自动修复**：复用 HealModule 现有流程（BullMQ → ai-agent → PR）

## 备选方案

| 方案 | 评估 |
|---|---|
| **A. 前端直连 LLM** | 暴露 API Key；无法注入服务端上下文（issue 详情、sourcemap）；放弃 |
| **B. 全部走 ai-agent（BullMQ）** | 延迟高（非实时）；简单对话无需 ReAct 循环；过度设计 |
| **C（推荐）. server 轻量 LLM + 复杂场景走 ai-agent** | 简单对话秒级响应；复杂修复复用现有基础设施 |

## 影响

- **新增模块**：`AiChatModule`（server 内，不打破模块边界）
- **新增表**：`ai_conversations` + `ai_messages`（2 张）
- **新增 ID 前缀**：`conv_` + `msg_`
- **env 复用**：`LLM_PROVIDER` / `DEEPSEEK_*` 等已在 `AiAgentEnvSchema`，server 侧新增 `AI_CHAT_MODEL` 可选覆盖
- **前端新增**：全局 AiDrawer 组件 + DiagnoseButton 通用组件
- **不影响**：现有 SDK / Gateway / 其他模块

## 后续

- 实现后更新 `docs/SPEC.md` §5 路由清单 + `docs/ARCHITECTURE.md` §3.1 模块拓扑
- Demo 场景 + apps/docs 页面待实现后补齐
