# ADR-0032: 认证与项目管理 MVP（T1.1.7 · JWT + RBAC + 项目 CRUD + Token 管理）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-05-04 |
| 决策人 | @Robin |

## 背景

Phase 1 基础设施最后一块：认证与项目管理。当前状态：

- 数据表 **已建**：`users` / `projects` / `project_keys` / `project_members` / `environments`（ADR-0017）
- 环境变量 **已定义**：`JWT_SECRET` / `JWT_EXPIRES_IN` / `REFRESH_TOKEN_SECRET` / `REFRESH_TOKEN_EXPIRES_IN`（`ServerEnvSchema`）
- ID 前缀 **已注册**：`usr` / `proj` / `pk` / `env`（`packages/shared/src/id.ts`）
- DSN Guard **已实现**（T1.3.2，`gateway/dsn-auth.guard.ts`）：`publicKey` → `projectId` 解析
- ApiKeyGuard **已实现**（ADR-0031，`sourcemap/api-key.guard.ts`）：`X-Api-Key` → `secretKey` 校验
- DashboardModule **无鉴权**：11 个 Controller 全部裸露，`projectId` 来自 query 参数

阻塞：
- M1.6 异常 Issues 模块（需要 ProjectGuard 做项目隔离）
- TM.2.B 应用管理页面（`/settings/projects` / `members` / `tokens`）
- 后续所有 `/api/v1/*` 路由（SPEC §5.3 约定 JWT Bearer）

约束：
- JWT 1h + Refresh Token 7d（SPEC §11）
- 四角色：`owner` / `admin` / `member` / `viewer`（SPEC §10）
- 路由前缀 `/api/v1/auth/*` + `/api/v1/projects/*`（SPEC §5.3）
- 现有 DsnAuthGuard / ApiKeyGuard / RateLimitGuard 不受影响
- `main.ts` CORS `credentials: true` 已就绪
- 密码哈希选型待本 ADR 决定（ADR-0017 推迟至此）

## 决策

### 1. 密码哈希：bcrypt

选 `bcrypt`（`bcryptjs` 纯 JS 实现）：
- 零 native 编译依赖，monorepo 内 CI 友好
- 12 轮 salt（`BCRYPT_ROUNDS=12`，env 可配）
- argon2id 安全性更优但需 native binding，MVP 阶段 bcrypt 足够

### 2. Refresh Token 存储：Redis

- Key：`auth:refresh:<sha256(token)>` → `{ userId, email, role, issuedAt }`
- TTL：`REFRESH_TOKEN_EXPIRES_IN`（默认 7d）
- 登出时删除对应 key
- 同一用户可多设备并发登录（不限 token 数量，MVP 不做设备管理）

### 3. JWT Payload

```typescript
interface JwtPayload {
  sub: string;      // userId (usr_xxx)
  email: string;
  role: string;     // 系统角色 "admin" | "user"
  iat: number;
  exp: number;
}
```

### 4. Guard 层级

```
JwtAuthGuard          → 校验 Bearer token，注入 req.user: JwtAuthContext
ProjectGuard          → 从 query/params/body 提取 projectId，校验 project_members 成员资格
RolesGuard            → 结合 @Roles() 装饰器，校验项目角色（owner/admin/member/viewer）
```

- `JwtAuthGuard`：全局可选（部分路由如 `/healthz` 不需要）
- `ProjectGuard`：需要 `JwtAuthGuard` 前置，从 `req.user.userId` + `projectId` 查询 `project_members`
- `RolesGuard`：需要 `ProjectGuard` 前置，读取 `req.projectRole` 与 `@Roles()` 比对
- 系统 `admin` 角色自动绕过 ProjectGuard 成员检查（但仍注入 projectRole='admin'）

### 5. HTTP API

#### 5.1 认证（`/api/v1/auth`）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/auth/register` | 无 | 注册（email + password + displayName） |
| POST | `/auth/login` | 无 | 登录（email + password）→ `{ accessToken, refreshToken, user }` |
| POST | `/auth/refresh` | 无（body 带 refreshToken） | 刷新 → `{ accessToken, refreshToken }` |
| POST | `/auth/logout` | JWT | 登出（删除 refresh token） |
| GET | `/auth/me` | JWT | 当前用户信息 |

注册幂等：email 已存在 → 409 Conflict。
登录失败：密码错误 → 401（不区分「用户不存在」vs「密码错误」，防枚举）。
Refresh Token 轮换：每次 refresh 签发新对，旧 token 立即失效（防重放）。

#### 5.2 项目（`/api/v1/projects`）

| 方法 | 路径 | 鉴权 | 最低角色 | 说明 |
|---|---|---|---|---|
| POST | `/projects` | JWT | — | 创建项目（自动：owner 成员 + 默认 key + 默认环境） |
| GET | `/projects` | JWT | — | 列出当前用户的项目 |
| GET | `/projects/:id` | JWT + Project | viewer | 项目详情 |
| PATCH | `/projects/:id` | JWT + Project | admin | 更新项目（name/slug/platform/retentionDays） |
| DELETE | `/projects/:id` | JWT + Project | owner | 删除项目（软删除 is_active=false） |

创建项目副作用（事务内）：
1. INSERT `projects`
2. INSERT `project_members` (userId, 'owner')
3. INSERT `project_keys` (生成 publicKey + secretKey)
4. INSERT `environments` × 3 ('production', 'staging', 'development')

#### 5.3 成员（`/api/v1/projects/:id/members`）

| 方法 | 路径 | 鉴权 | 最低角色 | 说明 |
|---|---|---|---|---|
| GET | `/projects/:id/members` | JWT + Project | viewer | 列出成员 |
| POST | `/projects/:id/members` | JWT + Project | admin | 邀请成员（email + role） |
| PATCH | `/projects/:id/members/:userId` | JWT + Project | admin | 更新角色 |
| DELETE | `/projects/:id/members/:userId` | JWT + Project | admin | 移除成员 |

约束：
- owner 不可被降级 / 移除（需先转让 ownership）
- 不可移除自己（防止项目无人管理）
- 邀请不存在的 email → 400（MVP 不支持邮件邀请，需先注册）

#### 5.4 API Token（`/api/v1/projects/:id/tokens`）

| 方法 | 路径 | 鉴权 | 最低角色 | 说明 |
|---|---|---|---|---|
| GET | `/projects/:id/tokens` | JWT + Project | viewer | 列出 token（secretKey 脱敏） |
| POST | `/projects/:id/tokens` | JWT + Project | admin | 创建 token → 返回完整 secretKey（仅此一次） |
| PATCH | `/projects/:id/tokens/:tokenId` | JWT + Project | admin | 更新 label / is_active |
| DELETE | `/projects/:id/tokens/:tokenId` | JWT + Project | admin | 删除 token |

### 6. DashboardModule 鉴权接入

首版策略：**渐进式接入，不一次性改全部 Controller**。

- 新增 `JwtAuthGuard` 和 `ProjectGuard` 到 DashboardModule providers
- 所有 Dashboard Controller 统一加 `@UseGuards(JwtAuthGuard, ProjectGuard)`
- `projectId` 从 query 参数读取（现有契约不变）
- 测试环境（`db=null`）Guard 短路返回 true

### 7. Web 端认证流

- 登录态：`accessToken` 存 memory（非 localStorage，防 XSS）
- `refreshToken` 存 `httpOnly` cookie（由 Next.js middleware 管理）
- API 请求自动附加 `Authorization: Bearer <accessToken>`
- 401 响应触发 refresh 流程，refresh 也失败则跳转 `/login`
- 首版暂不实现：需要后续 TM.2.B 落地完整 Web UI

### 8. 目录落位

```
apps/server/src/modules/auth/
  ├── auth.module.ts
  ├── auth.service.ts           （注册/登录/刷新/登出/密码哈希）
  ├── auth.controller.ts        （/api/v1/auth/*）
  ├── jwt-auth.guard.ts         （Bearer token 校验）
  ├── project.guard.ts          （项目成员资格校验）
  ├── roles.guard.ts            （角色装饰器校验）
  ├── roles.decorator.ts        （@Roles() 自定义装饰器）
  └── dto/
      ├── register.dto.ts
      ├── login.dto.ts
      ├── refresh.dto.ts
      └── auth-response.dto.ts

apps/server/src/modules/auth/
  ├── projects.controller.ts    （/api/v1/projects/*）
  ├── projects.service.ts       （CRUD + 事务副作用）
  ├── members.controller.ts     （/api/v1/projects/:id/members/*）
  ├── members.service.ts
  ├── tokens.controller.ts      （/api/v1/projects/:id/tokens/*）
  ├── tokens.service.ts
  └── dto/
      ├── create-project.dto.ts
      ├── update-project.dto.ts
      ├── invite-member.dto.ts
      ├── update-member.dto.ts
      └── create-token.dto.ts
```

## 备选方案

### A. argon2id 替代 bcrypt
- **不选**：需要 native binding（`argon2` npm 包依赖 `@phc/argon2`），CI 环境需 build tools；MVP 阶段 bcrypt 12 轮已满足安全要求
- **升级路径**：T1.1.7 后可无缝切换（仅改 AuthService hash/compare 方法）

### B. Refresh Token 存数据库（`refresh_tokens` 表）
- **不选**：Redis TTL 自动过期更简洁，不需要手动清理 cron；多设备场景 Redis 扫描比 DB 查询更高效
- **风险**：Redis 重启丢失所有 refresh token → 用户需重新登录 → 可接受（MVP）

### C. Session + Cookie 替代 JWT
- **不选**：DESIGN §2 已决定 JWT + Refresh Token；需支持开放 API 和无状态横向扩缩

### D. 全局 JwtAuthGuard（APP_GUARD）+ @Public() 装饰器
- **不选**：现有 `/healthz` / `/ingest/v1/*` / `/sourcemap/v1/*` 使用不同鉴权，全局 JWT 会增加豁免复杂度；显式 `@UseGuards()` 更清晰

## 影响

### 收益
- Phase 1 基础设施闭环：所有后续模块（M1.6 Issues / TM.2.B 应用管理 / Phase 4 告警）有鉴权基础
- DashboardModule 从裸露升级为项目隔离，多租户安全
- ProjectGuard + RolesGuard 可复用于全部 `/api/v1/*` 路由

### 成本
- 新增 `bcryptjs`（~30KB gzip）到 server 依赖
- 新增约 1500 行后端代码（AuthService ~200、Guards ~150、Controllers ~400、Services ~300、DTOs ~150、测试 ~300）
- Redis 新增 `auth:refresh:*` key 空间

### 风险
- **首版注册无邮箱验证**：MVP 先跳过，后续 Phase 补邮件验证
- **Redis 重启导致 refresh token 丢失**：用户需重新登录，可接受
- **DashboardModule 全量接入 Guard 可能影响现有无鉴权测试**：Guard 在 test env（db=null）短路

## 后续

- 任务：`T1.1.7.1` ~ `T1.1.7.8` — 全部完成（2026-05-04）
- **Demo 路径**：`examples/nextjs-demo/scripts/auth-flow.sh`（curl 11 步完整流程）
- **Docs 页面**：`apps/docs/docs/reference/auth.md`（18 端点 + 角色矩阵 + 鉴权链路）
- Web 端完整 UI（登录/注册页 + Settings 三页）→ TM.2.B 独立切片
- 邮箱验证 + 忘记密码 → Phase 4 补齐
- OAuth2 第三方登录（GitHub/Google）→ Phase 6
- 多设备会话管理 / Token 吊销列表 → 按需
