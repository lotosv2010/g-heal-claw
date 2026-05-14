# ARD 模板（接口需求文档）

> 供 Phase 1/Phase 3 使用。面向 API/接口设计，适用于后端服务、微服务、第三方集成。

---

## 模板结构

```markdown
# ARD: {接口/模块名称}

| 字段 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | YYYY-MM-DD |
| 作者 | @name |
| 状态 | Draft / Review / Approved |
| 关联 REQ | REQ-XXX |
| 关联 ADR | ADR-NNNN |

## 1. 概述

### 1.1 接口用途
[一句话说明这个接口/模块解决什么问题]

### 1.2 调用方
| 调用方 | 角色 | 调用频率 |
|--------|------|----------|
| ...    | ...  | ...      |

## 2. 接口契约

### 2.1 端点定义

```
{METHOD} /api/v1/{resource}

Authentication: Bearer <token>
Content-Type: application/json
```

### 2.2 请求参数

**Path Parameters**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ...  | ...  | ...  | ...  |

**Query Parameters**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| ...  | ...  | ...  | ...    | ...  |

**Request Body** (JSON):
```json
{
  "field": "value"
}
```

### 2.3 请求 Schema（Zod）

```typescript
const XxxRequestSchema = z.object({
  field: z.string().min(1).max(255),
  // ...
});
type XxxRequest = z.infer<typeof XxxRequestSchema>;
```

### 2.4 响应格式

**成功（200）**:
```json
{
  "data": { ... }
}
```

**分页（200）**:
```json
{
  "data": [ ... ],
  "pagination": { "page": 1, "limit": 20, "total": 100 }
}
```

**错误（4xx/5xx）**:
```json
{
  "error": "ERROR_CODE",
  "message": "人类可读的错误描述",
  "details": { ... }
}
```

### 2.5 响应 Schema（Zod）

```typescript
const XxxResponseSchema = z.object({
  data: z.object({ ... }),
});
type XxxResponse = z.infer<typeof XxxResponseSchema>;
```

## 3. 错误码

| HTTP 状态码 | Error Code | 说明 | 处理建议 |
|------------|------------|------|----------|
| 400 | BAD_REQUEST | 参数校验失败 | 检查请求参数 |
| 401 | UNAUTHORIZED | Token 缺失或无效 | 重新登录 |
| 403 | FORBIDDEN | 无权限访问 | 联系管理员 |
| 404 | NOT_FOUND | 资源不存在 | 检查资源 ID |
| 409 | CONFLICT | 资源冲突（重复） | 检查幂等键 |
| 429 | RATE_LIMITED | 触发限流 | 降低频率或重试 |
| 500 | INTERNAL_ERROR | 内部错误 | 提交 Issue |

## 4. 数据模型（如涉及新表/字段）

### 4.1 表结构
```sql
-- 表名：xxx
-- 说明：...
CREATE TABLE xxx (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 Drizzle Schema
```typescript
export const xxxTable = pgTable('xxx', {
  id: uuid('id').defaultRandom().primaryKey(),
  // ...
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

## 5. 消息队列（如涉及 BullMQ）

| 队列名 | 方向 | Job 类型 | 并发 | 重试策略 |
|--------|------|----------|------|----------|
| `xxx` | 入队/出队 | JobData | N | 3 次指数退避 |

**Job Data Schema**:
```typescript
const XxxJobDataSchema = z.object({
  // ...
});
```

## 6. 非功能需求

| 类别 | 要求 |
|------|------|
| 性能 | 单次请求 < 200ms（P95） |
| 限流 | {N} req/s per project |
| 幂等性 | 通过 idempotency-key 保证 |
| 版本 | API v1，向后兼容 |
| 监控 | 接入现有 metrics + alerting |

## 7. 变更兼容性

| 变更类型 | 兼容性 | 说明 |
|----------|--------|------|
| 新增可选字段 | ✅ 向前兼容 | 旧客户端忽略未知字段 |
| 新增必填字段 | ❌ 不兼容 | 需版本升级 |
| 修改字段类型 | ❌ 不兼容 | 需版本升级 |
| 新增端点 | ✅ 向前兼容 | 不影响现有端点 |

## 8. 测试要点

- [ ] Happy Path：正常请求返回 200 + 预期 data
- [ ] 参数校验：非法参数返回 400 + 具体 error path
- [ ] 认证：无/错 Token 返回 401
- [ ] 权限：越权访问返回 403
- [ ] 幂等：重复请求不产生副作用
- [ ] 限流：超过阈值返回 429
```

---

## 使用指南

### 何时使用 ARD

- 新增或修改 API 端点（`apps/server`）
- 新增 BullMQ 队列通信
- 第三方服务集成（如钉钉机器人、飞书通知）
- 数据模型变更（新表/新字段）

### 与 PRD 的关系

- 纯后端/接口需求 → 直接用 ARD，跳过 PRD
- 功能需求涉及接口 → 先 PRD（用户视角）→ 再 ARD（接口视角）
- 本项目中，接口契约通常已定义在 `docs/SPEC.md` 中，新增接口时更新 SPEC 而非独立 ARD

### 决策树：PRD vs ARD vs ADR

```
需求涉及 UI/用户交互？
  ├─ YES → 需要 PRD（用户视角的需求文档）
  │         └─ 同时涉及新接口？→ 也需要 ARD
  └─ NO → 纯后端需求
            ├─ 涉及架构决策（新技术/新模块/新通信模式）→ 需要 ADR
            └─ 涉及新接口/新数据模型 → 需要 ARD
                  └─ 轻量接口变更 → 直接更新 docs/SPEC.md，不建独立 ARD
```
