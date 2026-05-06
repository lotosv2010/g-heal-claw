# ADR-0035: 告警引擎 MVP（Phase 4 M4.1 + M4.2）

| 字段 | 值 |
|---|---|
| 状态 | 提议 |
| 日期 | 2026-05-06 |
| 决策人 | @Robin |

## 背景

Phase 1~3 已交付完整的数据采集 → 入库 → 聚合 → 展示链路。用户现在需要**主动告警**能力：当指标异常时自动推送通知，而不是被动等待用户打开 Dashboard 发现问题。

SPEC §7 已完整定义告警引擎契约：
- 规则 DSL（target / condition / filter / severity / cooldown / channels）
- 评估流程（每分钟 cron → 查聚合表 → 命中写 history → 通知分发）
- 状态机（firing → resolved）
- 预置规则模板（6 条）
- 通知渠道（邮件/钉钉/企微/Slack/Webhook/短信）

本 ADR 落地 MVP 实现。

## 决策

### 1. 模块划分

| 模块 | 职责 | 位置 |
|---|---|---|
| `AlertModule` | 规则 CRUD + 评估 cron + 状态机 + 历史记录 | `apps/server/src/modules/alert/` |
| `NotificationModule` | 渠道 CRUD + 分发 Worker + 5 种 Provider | `apps/server/src/modules/notification/` |

### 2. 数据表

```sql
-- 告警规则
CREATE TABLE IF NOT EXISTS alert_rules (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  name        TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  target      TEXT NOT NULL,        -- error_rate | api_success_rate | web_vital | issue_count | custom_metric
  filter      JSONB DEFAULT '{}',   -- { environment?, release?, tag? }
  condition   JSONB NOT NULL,       -- { aggregation, operator, threshold, window: { durationMs, minSamples? } }
  severity    TEXT NOT NULL DEFAULT 'warning',  -- info | warning | critical
  cooldown_ms INTEGER NOT NULL DEFAULT 300000,  -- 默认 5 分钟静默
  channels    TEXT[] NOT NULL DEFAULT '{}',      -- 通知渠道 id 数组
  last_fired_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 告警历史
CREATE TABLE IF NOT EXISTS alert_history (
  id          TEXT PRIMARY KEY,
  rule_id     TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  project_id  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'firing',  -- firing | resolved
  metric_value DOUBLE PRECISION,
  threshold   DOUBLE PRECISION,
  fired_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  notified    BOOLEAN NOT NULL DEFAULT false
);

-- 通知渠道
CREATE TABLE IF NOT EXISTS channels (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,  -- email | dingtalk | wecom | slack | webhook
  config      JSONB NOT NULL, -- 渠道特定配置（加密存储密钥）
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3. 评估流程

```
@Cron('*/1 * * * *')  每分钟触发
  ↓
扫描所有 enabled=true 的 alert_rules
  ↓
对每条规则：按 target + condition 构造聚合 SQL → 查对应 raw 表
  ↓
判定：metric_value <operator> threshold？
  ↓ 是
检查冷却期：now - last_fired_at < cooldownMs → 跳过
  ↓ 否（不在冷却）
写入 alert_history（status=firing）
更新 rule.last_fired_at
  ↓
BullMQ notifications 队列：{ historyId, ruleId, channels[], templateVars }
```

**自动 resolved**：下次评估时条件不再满足 → 将 firing 的 history 标记为 resolved + resolved_at。

### 4. 通知 Provider

| 渠道 | Provider | 配置字段 |
|---|---|---|
| email | Nodemailer SMTP | `{ host, port, secure, user, pass, from }` |
| dingtalk | HTTP POST（Webhook URL + sign） | `{ webhookUrl, secret? }` |
| wecom | HTTP POST（Webhook URL） | `{ webhookUrl }` |
| slack | HTTP POST（Incoming Webhook） | `{ webhookUrl }` |
| webhook | HTTP POST（自定义 URL） | `{ url, headers?, method? }` |

**模板渲染**：简单字符串替换 `{{var}}` → 实际值。变量集：`rule.name / metric.value / threshold / severity / project.name / environment / window`。

### 5. Web 管理页面

| 页面 | 功能 |
|---|---|
| `/settings/alerts` | 规则列表 + 创建/编辑/启停/删除 + 历史记录查看 |
| `/settings/channels` | 渠道列表 + 创建/编辑/测试发送/删除 |

### 6. 预置规则

项目创建时（`ProjectsService.create`）自动插入 6 条预置规则（`enabled=false`），复用 SPEC §7.3 定义。

### 7. MVP 范围

**纳入**：
- 3 张表 + Drizzle schema + 迁移
- AlertModule（CRUD + cron 评估 + 状态机）
- NotificationModule（CRUD + BullMQ Worker + 5 Provider）
- Web `/settings/alerts` + `/settings/channels` 页面
- 预置规则下发
- 告警模板变量
- 测试发送（channels CRUD 中的"测试"按钮）

**排除**：
- 短信渠道（需真实 API Key，后续独立接入）
- 自动自愈联动（Phase 5 HealModule 完成后接入）
- 复杂 DSL 条件组合（AND/OR 嵌套，MVP 仅支持单条件）

## 备选方案

### 方案 B：Push 模式（事件驱动实时告警）

Gateway 入库后立即触发告警评估（而非 cron 轮询）。

**否决**：
- 高吞吐下每个事件触发评估会导致大量无效查询
- 窗口聚合需要等待足够样本，实时触发会命中 minSamples 不足
- ADR-0006 已决策采用 Pull 式定时评估

### 方案 C：独立告警微服务

将 AlertModule 拆为独立进程。

**否决**：
- ADR-0001 决策为模块化单体
- MVP 阶段规则量小（每项目 ~10 条），单进程 cron 足够
- 后续流量增大时可通过 BullMQ Worker 水平扩展

## 影响

- **SPEC**：§7 实现对齐（无变更）
- **ARCHITECTURE**：AlertModule + NotificationModule 从规划 → 已实现
- **apps/server**：新增 2 个 Module + 3 张表 + 2 个 BullMQ 队列
- **apps/web**：新增 2 个 settings 页面
- **packages/shared**：新增 2 个队列名常量
- **nav.ts**：`settings/alerts` + `settings/channels` placeholder 清空

## 后续

- [ ] 实现完成后补充 demo 路径 + apps/docs 页面链接
- [ ] Phase 5 自愈联动：告警规则支持 `autoHeal: true` 选项
- [ ] 短信渠道：独立 PR 接入阿里云/腾讯云 SMS Provider
