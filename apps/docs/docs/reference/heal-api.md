# Heal API

AI 自愈诊断接口，基于 ADR-0036 实现。通过 API 触发 Issue 自动诊断并生成修复 PR。

## 端点概览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/projects/:projectId/issues/:issueId/heal` | 触发 AI 自愈诊断 |
| GET | `/api/v1/projects/:projectId/heal` | 查询 Heal 任务列表 |
| GET | `/api/v1/projects/:projectId/heal/:healJobId` | 查询 Heal 任务详情 |
| DELETE | `/api/v1/projects/:projectId/heal/:healJobId` | 取消 Heal 任务 |

所有端点需 JWT 认证（`Authorization: Bearer <token>`）+ 项目权限。

## 触发诊断

```http
POST /api/v1/projects/:projectId/issues/:issueId/heal
Content-Type: application/json
Authorization: Bearer <token>

{
  "repoUrl": "https://github.com/your-org/your-repo",
  "branch": "main"
}
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `repoUrl` | string (URL) | 是 | Git 仓库地址 |
| `branch` | string | 否 | 目标分支，默认 `main` |

**响应示例（200）：**

```json
{
  "data": {
    "id": "heal_abc123",
    "projectId": "proj_xyz",
    "issueId": "iss_456",
    "status": "queued",
    "repoUrl": "https://github.com/your-org/your-repo",
    "branch": "main",
    "triggeredBy": "usr_789",
    "createdAt": "2026-05-07T10:00:00Z"
  }
}
```

## 查询任务列表

```http
GET /api/v1/projects/:projectId/heal?page=1&limit=20&status=diagnosing
Authorization: Bearer <token>
```

**查询参数：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `page` | number | 否 | 页码，默认 `1` |
| `limit` | number | 否 | 每页条数，1~100，默认 `20` |
| `status` | string | 否 | 按状态过滤，可选值见下方 |

**响应示例（200）：**

```json
{
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 3 }
}
```

## 查询任务详情

```http
GET /api/v1/projects/:projectId/heal/:healJobId
Authorization: Bearer <token>
```

**响应示例（200）：**

```json
{
  "data": {
    "id": "heal_abc123",
    "projectId": "proj_xyz",
    "issueId": "iss_456",
    "status": "pr_created",
    "repoUrl": "https://github.com/your-org/your-repo",
    "branch": "main",
    "prUrl": "https://github.com/your-org/your-repo/pull/42",
    "diagnosis": "根因：未对 null 做防御性检查...",
    "triggeredBy": "usr_789",
    "createdAt": "2026-05-07T10:00:00Z",
    "completedAt": "2026-05-07T10:01:30Z"
  }
}
```

## 取消任务

```http
DELETE /api/v1/projects/:projectId/heal/:healJobId
Authorization: Bearer <token>
```

仅 `queued` 状态可取消，其他状态返回 400。

## 任务状态流转

```
queued → diagnosing → patching → verifying → pr_created
                  ↘       ↘         ↘
                   failed   failed    failed
```

| 状态 | 说明 |
|---|---|
| `queued` | 任务已入队，等待 AI Agent 消费 |
| `diagnosing` | Agent 正在分析堆栈和源码 |
| `patching` | Agent 正在生成修复代码 |
| `verifying` | 修复代码验证中（未来沙箱阶段） |
| `pr_created` | 修复 PR 已创建，等待人工 Review |
| `failed` | 诊断或修复失败，详见 `errorMessage` |

## 仓库配置

在项目根目录放置 `.ghealclaw.yml` 可限制 AI 的操作范围：

```yaml
heal:
  maxLoc: 50
  paths:
    - src/**
    - lib/**
  forbidden:
    - node_modules/**
    - dist/**
```

| 字段 | 说明 | 默认值 |
|---|---|---|
| `maxLoc` | 单次修复最大变更行数 | `50` |
| `paths` | 允许修改的路径白名单 | `["src/**"]` |
| `forbidden` | 禁止修改的路径 | `[]` |
