# g-heal-claw 技术规格说明书

> 版本: 1.0.0 | 日期: 2026-04-22

---

## 1. 概述

本文档定义 g-heal-claw（自愈式生产监控系统）的功能规格，涵盖 SDK 接口、API 契约、数据模型，以及各服务的行为规则。

---

## 2. SDK 规格 (`@g-heal-claw/sdk`)

### 2.1 初始化

```typescript
interface GHealClawOptions {
  dsn: string                          // 格式: https://<key>@<host>/<project-id>
  release?: string                     // 语义化版本号或构建 hash
  environment?: string                 // 如 "production", "staging"
  sampleRate?: number                  // 0.0 - 1.0, 默认 1.0
  maxBreadcrumbs?: number              // 默认 100
  beforeSend?: (event: ErrorEvent) => ErrorEvent | null
  debug?: boolean                      // 开启控制台日志, 默认 false
}

GHealClaw.init(options: GHealClawOptions): void
```

- DSN 解析为 `protocol`、`publicKey`、`host`、`projectId`。
- DSN 无效时，SDK 打印警告并变为空操作（no-op）。
- `sampleRate` 按事件级别求值：`Math.random() < sampleRate`。
- `beforeSend` 可修改事件或返回 `null` 以丢弃。

### 2.2 自动错误捕获

| 来源 | 处理器 | 捕获字段 |
|---|---|---|
| 未捕获异常 | `window.onerror` | message, source, lineno, colno, error 对象 |
| 未处理的 Promise 拒绝 | `window.onunhandledrejection` | reason（Error 或字符串） |

- SDK 包裹已有处理器（如果存在），在自身处理后调用原处理器。
- 每个捕获的错误生成一条 `ErrorEvent` 载荷。

### 2.3 手动捕获

```typescript
GHealClaw.captureException(error: Error, context?: Record<string, unknown>): string  // 返回事件 ID
GHealClaw.captureMessage(message: string, level?: 'info' | 'warning' | 'error'): string
```

### 2.4 上下文 API

```typescript
GHealClaw.setUser(user: { id?: string; email?: string; name?: string }): void
GHealClaw.setExtra(key: string, value: unknown): void
GHealClaw.setTag(key: string, value: string): void
```

- 上下文附加到所有后续事件，直到被覆盖或清除。

### 2.5 面包屑（Breadcrumbs）

自动捕获的面包屑类型：

| 类型 | 来源 | 数据 |
|---|---|---|
| `console` | `console.log/warn/error` | level, message |
| `click` | `addEventListener('click')` | 目标选择器, 文本内容（截断 128 字符） |
| `xhr` | `XMLHttpRequest` monkey-patch | method, url, status_code, duration_ms |
| `fetch` | `fetch` monkey-patch | method, url, status_code, duration_ms |
| `navigation` | `popstate`, `pushState`, `replaceState` | from, to |

- 存储在 `maxBreadcrumbs` 大小的环形缓冲区中。
- 单条面包屑结构：`{ type, category, message, data, timestamp, level }`。

### 2.6 传输层

- 事件批量发送：达到 **10 条** 或 **5 秒** 时刷新。
- 请求：`POST <host>/api/v1/events`，`Content-Type: application/json`。
- 认证头：`X-GHC-Auth: <publicKey>`。
- 重试：3 次，指数退避（1s, 2s, 4s）。4xx 直接丢弃（不可重试）。
- 页面卸载时：使用 `navigator.sendBeacon()` 刷新剩余事件。

### 2.7 事件载荷

```typescript
interface ErrorEventPayload {
  event_id: string             // UUID v4, 客户端生成
  timestamp: string            // ISO 8601
  platform: 'javascript'
  release?: string
  environment?: string
  error: {
    type: string               // 如 "TypeError"
    message: string
    stack_trace: string        // 原始堆栈字符串
  }
  context: {
    browser: string            // 如 "Chrome 125.0"
    os: string                 // 如 "Windows 10"
    url: string
    screen: string             // 如 "1920x1080"
    user_agent: string
  }
  user?: {
    id?: string
    email?: string
    name?: string
  }
  tags: Record<string, string>
  extra: Record<string, unknown>
  breadcrumbs: Breadcrumb[]
}
```

### 2.8 包体积要求

| 格式 | 目标环境 | 最大体积 (gzip) |
|---|---|---|
| ESM | 现代打包工具 | 8 KB |
| CJS | 传统 Node/打包工具 | 8 KB |
| IIFE/UMD | `<script>` 标签 | 10 KB |

- 零运行时依赖。
- 支持 Tree-shaking：手动捕获和面包屑模块在未使用时可被摇掉。

---

## 3. API 契约

### 3.1 数据采集网关（Ingestion Gateway）

**基础 URL**: `<gateway-host>/api/v1`

#### POST /events

接收来自 SDK 的错误事件。

| 字段 | 值 |
|---|---|
| 认证 | `X-GHC-Auth: <publicKey>` |
| Content-Type | `application/json` |
| 请求体 | `ErrorEventPayload[]`（数组，最多 50 条） |
| 响应 202 | `{ "accepted": number }` |
| 响应 400 | `{ "error": "validation_error", "details": [...] }` |
| 响应 401 | `{ "error": "invalid_dsn" }` |
| 响应 429 | `{ "error": "rate_limited", "retry_after": number }` |

**限流策略**：按项目维度的令牌桶算法。默认：1000 事件/分钟。可在项目设置中配置。

#### GET /health

| 响应 200 | `{ "status": "ok", "version": string, "uptime": number }` |

---

### 3.2 Sourcemap 服务

**基础 URL**: `<sourcemap-host>/api/v1`

#### POST /sourcemaps

上传 sourcemap 文件。

| 字段 | 值 |
|---|---|
| 认证 | `Authorization: Bearer <api-key>` |
| Content-Type | `multipart/form-data` |
| 字段 | `release`（字符串）, `file_path`（字符串）, `file`（二进制 .map 文件） |
| 响应 201 | `{ "id": UUID, "storage_key": string }` |
| 响应 409 | `{ "error": "duplicate", "existing_id": UUID }` |

#### POST /resolve

解析压缩后的堆栈信息。

| 字段 | 值 |
|---|---|
| 认证 | 内部服务令牌 |
| 请求体 | `{ "project_id": UUID, "release": string, "stack_trace": string }` |
| 响应 200 | `{ "resolved_stack_trace": string, "frames": ResolvedFrame[] }` |

```typescript
interface ResolvedFrame {
  original_file: string        // 如 "src/components/UserProfile.tsx"
  original_line: number
  original_column: number
  original_function?: string
  context_lines?: {            // 前 5 行 + 当前行 + 后 5 行
    pre: string[]
    line: string
    post: string[]
  }
}
```

---

### 3.3 后台管理 API（Dashboard API）

**基础 URL**: `<dashboard-api>/api/v1`

除特别说明外，所有接口需要 `Authorization: Bearer <jwt>`。

#### 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /auth/register | 注册账户：`{ email, name, password }` -> `{ user, token }` |
| POST | /auth/login | 登录：`{ email, password }` -> `{ user, token, refresh_token }` |
| POST | /auth/refresh | 刷新令牌：`{ refresh_token }` -> `{ token, refresh_token }` |
| POST | /auth/password-reset | 请求重置密码：`{ email }` -> 204 |

#### 项目管理

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /projects | 列出用户的项目 |
| POST | /projects | 创建项目：`{ name, platform }` -> `{ project }`（DSN 自动生成） |
| GET | /projects/:id | 获取项目详情（含 DSN） |
| PATCH | /projects/:id | 更新项目设置 |
| DELETE | /projects/:id | 软删除项目 |
| GET | /projects/:id/members | 列出团队成员 |
| POST | /projects/:id/members | 邀请成员：`{ email, role }` |
| DELETE | /projects/:id/members/:userId | 移除成员 |

#### 异常（Issues）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /projects/:id/issues | 列出异常。查询参数：`status`, `severity`, `sort`, `order`, `page`, `limit`, `since`, `until` |
| GET | /issues/:id | 异常详情（含最新事件、诊断结果、统计数据） |
| PATCH | /issues/:id | 更新状态：`{ status, resolved_in_version? }` |
| POST | /issues/:id/assign | 分配负责人：`{ user_id }` |

#### 事件（Events）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /issues/:id/events | 分页获取某异常的事件列表 |
| GET | /events/:id | 单个事件详情（含解析后堆栈、面包屑） |

#### AI 诊断

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /issues/:id/diagnosis | 获取最新诊断结果 |
| POST | /issues/:id/diagnosis | 触发重新诊断 |
| POST | /diagnoses/:id/feedback | 提交反馈：`{ rating: 'helpful' \| 'not_helpful' \| 'partial' }` |

#### 通知规则

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /projects/:id/notification-rules | 列出规则 |
| POST | /projects/:id/notification-rules | 创建规则 |
| PATCH | /notification-rules/:id | 更新规则 |
| DELETE | /notification-rules/:id | 删除规则 |
| POST | /notification-rules/:id/test | 发送测试通知 |

#### 自动修复

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /issues/:id/fixes | 列出修复尝试 |
| POST | /fixes/:id/approve | 批准修复 -> 触发部署 |
| POST | /fixes/:id/reject | 拒绝修复：`{ reason? }` |

---

## 4. 数据模型

### 4.1 枚举类型

```
ProjectPlatform:     web | node | react-native
IssueStatus:         open | resolved | ignored | auto_fixed
IssueSeverity:       critical | error | warning | info
UserRole:            admin | member | viewer
NotificationChannel: email | slack | dingtalk | webhook
NotificationTrigger: new_issue | regression | severity_change | auto_fix_ready
AutoFixStatus:       pending | pr_created | approved | deployed | failed
DeployStatus:        triggered | running | success | failed
FeedbackRating:      helpful | not_helpful | partial
```

### 4.2 实体定义

#### User（用户）

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK, 自动生成 |
| email | varchar(255) | UNIQUE, NOT NULL |
| name | varchar(255) | NOT NULL |
| password_hash | varchar(255) | NOT NULL |
| role | UserRole | NOT NULL, 默认 `member` |
| created_at | timestamptz | NOT NULL, 默认 now() |
| updated_at | timestamptz | NOT NULL, 默认 now() |

#### Project（项目）

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK, 自动生成 |
| name | varchar(255) | NOT NULL |
| dsn | varchar(255) | UNIQUE, NOT NULL |
| platform | ProjectPlatform | NOT NULL, 默认 `web` |
| repo_url | varchar(512) | 可空 |
| repo_access_token | varchar(512) | 可空，静态加密 |
| owner_id | uuid | FK -> User.id, NOT NULL |
| settings | jsonb | 默认 `{}` |
| created_at | timestamptz | NOT NULL, 默认 now() |
| updated_at | timestamptz | NOT NULL, 默认 now() |

#### SourcemapUpload（Sourcemap 上传记录）

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK -> Project.id, NOT NULL |
| release_version | varchar(128) | NOT NULL |
| file_path | varchar(1024) | NOT NULL |
| storage_key | varchar(1024) | NOT NULL |
| uploaded_at | timestamptz | NOT NULL, 默认 now() |

**唯一约束**: `(project_id, release_version, file_path)`

#### ErrorEvent（错误事件）

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK -> Project.id, NOT NULL, 已索引 |
| release_version | varchar(128) | 可空 |
| timestamp | timestamptz | NOT NULL, 已索引 |
| error_type | varchar(255) | NOT NULL |
| message | text | NOT NULL |
| stack_trace | text | 可空 |
| resolved_stack_trace | text | 可空 |
| browser | varchar(255) | 可空 |
| os | varchar(255) | 可空 |
| url | varchar(2048) | 可空 |
| user_id | varchar(255) | 可空 |
| extra_context | jsonb | 默认 `{}` |
| breadcrumbs | jsonb | 默认 `[]` |
| fingerprint | varchar(64) | NOT NULL, 已索引 |
| created_at | timestamptz | NOT NULL, 默认 now() |

#### Issue（异常）

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK -> Project.id, NOT NULL, 已索引 |
| fingerprint | varchar(64) | NOT NULL, 已索引 |
| title | varchar(512) | NOT NULL |
| first_seen | timestamptz | NOT NULL, 默认 now() |
| last_seen | timestamptz | NOT NULL, 默认 now() |
| event_count | integer | NOT NULL, 默认 1 |
| status | IssueStatus | NOT NULL, 默认 `open`, 已索引 |
| severity | IssueSeverity | NOT NULL, 默认 `error` |
| assigned_to | uuid | FK -> User.id, 可空 |
| resolved_in_version | varchar(128) | 可空 |

**唯一约束**: `(project_id, fingerprint)`

#### AIDiagnosis（AI 诊断）

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK |
| issue_id | uuid | FK -> Issue.id, NOT NULL |
| model_used | varchar(128) | NOT NULL |
| prompt_hash | varchar(64) | NOT NULL |
| root_cause | text | NOT NULL, Markdown 格式 |
| solution | text | NOT NULL, Markdown 格式 |
| code_suggestion | text | 可空, unified diff 格式 |
| confidence_score | real | 可空, 0.0-1.0 |
| feedback_rating | FeedbackRating | 可空 |
| token_usage | integer | 可空 |
| created_at | timestamptz | NOT NULL, 默认 now() |

#### AutoFixAttempt（自动修复尝试）

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK |
| issue_id | uuid | FK -> Issue.id, NOT NULL |
| diagnosis_id | uuid | FK -> AIDiagnosis.id, NOT NULL |
| branch_name | varchar(255) | NOT NULL |
| pr_url | varchar(1024) | 可空 |
| status | AutoFixStatus | NOT NULL, 默认 `pending` |
| patch_diff | text | NOT NULL |
| created_at | timestamptz | NOT NULL, 默认 now() |
| reviewed_by | uuid | FK -> User.id, 可空 |
| reviewed_at | timestamptz | 可空 |

#### NotificationRule（通知规则）

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK -> Project.id, NOT NULL |
| channel | NotificationChannel | NOT NULL |
| config | jsonb | NOT NULL, 默认 `{}` |
| trigger | NotificationTrigger | NOT NULL |
| conditions | jsonb | 默认 `{}` |
| enabled | boolean | NOT NULL, 默认 `true` |

#### DeployTrigger（部署触发）

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK |
| auto_fix_attempt_id | uuid | FK -> AutoFixAttempt.id, NOT NULL |
| ci_provider | varchar(64) | NOT NULL |
| pipeline_url | varchar(1024) | 可空 |
| status | DeployStatus | NOT NULL, 默认 `triggered` |
| triggered_at | timestamptz | NOT NULL, 默认 now() |

---

## 5. 错误指纹算法

```
fingerprint = SHA256(
  normalize(error_type) + ":" +
  normalize(top_5_stack_frames)
)
```

**归一化规则**:
1. 去除每个帧的行号和列号。
2. 去除文件 URL 中的查询参数和哈希值。
3. 将动态片段（UUID、数字 ID）替换为 `<dynamic>`。
4. 将 webpack/vite 的 chunk hash 折叠为 `<hash>`。
5. 归一化后取前 5 个栈帧。

相同指纹的两个事件归属同一个 Issue。

---

## 6. 严重等级分类规则

| 条件 | 严重等级 |
|---|---|
| `SyntaxError` 或 `RangeError` | critical |
| 某 Issue 事件频率 > 100次/分钟 | critical |
| `TypeError`, `ReferenceError` | error |
| 通过 `captureMessage` 捕获的 `console.error` | warning |
| `captureMessage` 且 level 为 `info` | info |
| 默认（未匹配） | error |

规则按顺序匹配，首次命中生效。项目级别的自定义规则存储在 `Project.settings.severity_rules` 中。

---

## 7. AI 诊断规格

### 7.1 触发条件

- 新 Issue 创建（首次出现新指纹的事件）。
- 已解决的 Issue 回归（状态为 `resolved` 后再次出现事件）。
- 用户手动请求重新诊断。

### 7.2 Prompt 结构

```
System: 你是一位资深软件工程师，正在诊断一个生产环境错误。
        请用 Markdown 格式回复，包含三个部分：根因分析、解决方案、代码修复。

User:
  错误类型: {error_type}
  错误信息: {message}
  解析后堆栈:
    {resolved_stack_trace}
  源码上下文:
    {file_path}:{line_number}
    {context_lines}
  面包屑 (最近 10 条):
    {breadcrumbs}
  浏览器: {browser}
  页面 URL: {url}
```

### 7.3 响应结构

```markdown
## 根因分析
{错误发生原因的分析}

## 解决方案
{分步修复指导}

## 代码修复
```diff
{统一 diff 格式的代码修改（如适用）}
```
```

### 7.4 成本控制

- 每个 Issue 每小时最多 1 次诊断（通过 `prompt_hash` 去重）。
- 每项目月度 token 预算，可在 Project.settings 中配置。
- 预算耗尽后，诊断任务入队但不执行，直到下一个计费周期。

---

## 8. 通知载荷格式

### 8.1 Webhook 载荷

```json
{
  "event": "new_issue" | "regression" | "severity_change" | "auto_fix_ready",
  "timestamp": "ISO8601",
  "project": { "id": "uuid", "name": "string" },
  "issue": {
    "id": "uuid",
    "title": "string",
    "severity": "string",
    "status": "string",
    "event_count": 0,
    "url": "https://dashboard/issues/{id}"
  },
  "signature": "HMAC-SHA256 十六进制摘要"
}
```

### 8.2 签名验证

```
signature = HMAC-SHA256(webhook_secret, JSON.stringify(body))
```

请求头: `X-GHC-Signature: sha256=<hex>`。

---

## 9. CLI 规格 (`@g-heal-claw/cli`)

```bash
# 上传某次发版的 sourcemaps
npx @g-heal-claw/cli upload-sourcemaps \
  --release 1.2.3 \
  --path ./dist \
  --url-prefix "~/static/js" \
  --api-key <key> \
  --host https://sourcemap.example.com

# 参数说明
--release     必填。发布版本号。
--path        必填。包含 .map 文件的目录。
--url-prefix  可选。URL 前缀，用于替换/去除。默认 "~/"。
--api-key     必填。项目 API 密钥。也可通过 GHC_API_KEY 环境变量读取。
--host        必填。Sourcemap 服务地址。也可通过 GHC_HOST 环境变量读取。
--dry-run     可选。仅列出文件，不执行上传。
```

- 递归扫描 `--path` 目录下的 `*.map` 文件。
- 逐个通过 `POST /api/v1/sourcemaps` 上传。
- 报告：已上传数量、跳过（重复）数量、失败数量。
- 退出码：全部成功返回 0，有任何失败返回 1。
