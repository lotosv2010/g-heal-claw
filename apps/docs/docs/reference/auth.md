# 认证与项目管理 API

> ADR-0032 · T1.1.7 · 18 端点

## 概览

g-heal-claw 采用 **JWT + Refresh Token 轮换** 认证，项目级 **RBAC 四角色**（owner / admin / member / viewer）鉴权。

## 认证流程

```
注册/登录 → accessToken (1h) + refreshToken (7d, Redis)
           → 请求携带 Authorization: Bearer <accessToken>
           → accessToken 过期 → POST /auth/refresh 获取新对
           → 登出 → POST /auth/logout 销毁 refreshToken
```

## 鉴权链路

```
JwtAuthGuard → ProjectGuard → RolesGuard
    ↓                ↓              ↓
 解码 JWT      查 project_members   比较 @Roles() 声明
 注入 req.user  注入 req.projectMember  角色等级不够 → 403
```

---

## Auth 端点（/api/v1/auth）

### POST /api/v1/auth/register

注册新用户。

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| email | string | 是 | 合法邮箱 |
| password | string | 是 | ≥8 位 |
| displayName | string | 否 | 显示名 |

**响应 201：**
```json
{ "data": { "accessToken": "...", "refreshToken": "...", "user": { "id", "email", "displayName", "role" } } }
```

### POST /api/v1/auth/login

邮箱密码登录。

**请求体：** `{ email, password }`

**响应 200：** 同 register

**错误：** 401 INVALID_CREDENTIALS

### POST /api/v1/auth/refresh

刷新 token 对（旧 refreshToken 立即失效）。

**请求体：** `{ refreshToken }`

**响应 200：** `{ data: { accessToken, refreshToken } }`

### POST /api/v1/auth/logout 🔒

销毁 refreshToken。

**请求体：** `{ refreshToken }`

**响应 204**

### GET /api/v1/auth/me 🔒

获取当前用户信息。

**响应 200：** `{ data: { user: { id, email, displayName, role, ... } } }`

---

## Projects 端点（/api/v1/projects）🔒

### POST /api/v1/projects

创建项目（自动成为 owner，事务写入 projects + project_members + project_keys + environments×3）。

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string | 是 | 项目名 |
| slug | string | 是 | URL 友好标识（小写+数字+连字符） |
| platform | enum | 否 | web / miniapp / mobile，默认 web |

**响应 201：** 含 publicKey + secretKey（仅创建时返回完整 secretKey）

### GET /api/v1/projects

列出当前用户的所有项目。

### GET /api/v1/projects/:projectId 🔒🏗

项目详情（需项目成员身份）。

### PATCH /api/v1/projects/:projectId 🔒🏗 @Roles("admin")

更新项目配置。

### DELETE /api/v1/projects/:projectId 🔒🏗 @Roles("owner")

软删除项目。

---

## Members 端点（/api/v1/projects/:projectId/members）🔒🏗

### GET .../members

列出项目成员。

### POST .../members @Roles("admin")

邀请成员。**请求体：** `{ email, role: "admin" | "member" | "viewer" }`

### PATCH .../members/:userId @Roles("admin")

更新成员角色。**请求体：** `{ role }`

### DELETE .../members/:userId @Roles("admin")

移除成员（不可移除 owner）。

---

## Tokens 端点（/api/v1/projects/:projectId/tokens）🔒🏗

### GET .../tokens

列出 API Token（secretKey 脱敏显示）。

### POST .../tokens @Roles("admin")

创建 API Token。**请求体：** `{ label? }`

**响应 201：** 含完整 secretKey（仅此一次）

### DELETE .../tokens/:tokenId @Roles("admin")

删除 API Token。

---

## 角色权限矩阵

| 操作 | owner | admin | member | viewer |
|---|---|---|---|---|
| 查看 Dashboard | ✅ | ✅ | ✅ | ✅ |
| 邀请成员 | ✅ | ✅ | ❌ | ❌ |
| 更新成员角色 | ✅ | ✅ | ❌ | ❌ |
| 移除成员 | ✅ | ✅ | ❌ | ❌ |
| 更新项目配置 | ✅ | ✅ | ❌ | ❌ |
| 删除项目 | ✅ | ❌ | ❌ | ❌ |
| 创建/删除 Token | ✅ | ✅ | ❌ | ❌ |

---

## 图例

- 🔒 = 需要 `Authorization: Bearer <accessToken>`
- 🏗 = 需要 ProjectGuard（项目成员身份）
- `@Roles("admin")` = 需要 admin 或以上角色

## Demo

```bash
bash examples/nextjs-demo/scripts/auth-flow.sh
```

完整 11 步流程：注册 → 登录 → 创建项目 → 成员管理 → Token 管理 → Dashboard 鉴权 → 登出。
