# ADR-0033: Settings 管理页面 Web UI（应用 / 成员 / Token / Sourcemap）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-05-06 |
| 决策人 | @Robin |

## 背景

Phase 1 基础设施闭环后，后端 4 组管理 API 已全部就绪：

| 管理域 | 后端端点前缀 | 鉴权方式 | 状态 |
|---|---|---|---|
| 应用管理 | `POST/GET/PATCH/DELETE /api/v1/projects` | JWT + ProjectGuard(admin) | ✅ ADR-0032 |
| 成员权限 | `GET/POST/PATCH/DELETE /api/v1/projects/:id/members` | JWT + ProjectGuard(admin) | ✅ ADR-0032 |
| API Token | `GET/POST/DELETE /api/v1/projects/:id/tokens` | JWT + ProjectGuard(admin) | ✅ ADR-0032 |
| Sourcemap | `POST/GET/DELETE /sourcemap/v1/releases` | X-Api-Key | ✅ ADR-0031 |

前端 4 个 Settings 页面（`/settings/projects` / `members` / `tokens` / `sourcemaps`）仍为 PlaceholderPage 占位。

**待解决问题**：

1. **Sourcemap 端点鉴权不兼容**：Sourcemap API 使用 `X-Api-Key`（secret_key），前端管理员用 JWT 无法直接调用。
2. **projectId 来源**：Dashboard 大盘页通过 `NEXT_PUBLIC_DEFAULT_PROJECT_ID` env 取项目 ID，Settings 中项目列表页本身管理项目，而成员/Token/Sourcemap 页面需要知道"当前项目"。

## 决策

### 1. Sourcemap 管理：后端新增 Dashboard 代理端点

在 `DashboardModule` 新增 `SettingsSourcemapController`（走 JWT + ProjectGuard）：

- `GET /dashboard/v1/settings/sourcemaps/releases?projectId=` — 列出 Releases
- `GET /dashboard/v1/settings/sourcemaps/releases/:id/artifacts?projectId=` — 列出 Artifacts
- `DELETE /dashboard/v1/settings/sourcemaps/releases/:id?projectId=` — 删除 Release

内部复用现有 `DatabaseService` 直查 `releases` / `release_artifacts` 表（与 SourcemapController 共享数据源，不互相调用 Service）。

**理由**：
- 前端统一使用 JWT，不暴露 secretKey 到浏览器
- 代理层极薄（3 个 SELECT/DELETE，无业务逻辑），不违反模块边界
- 上传功能仍走 CLI / CI（`X-Api-Key`），管理页面仅查看和删除

### 2. projectId 路由策略：URL 参数 + 服务端 cookie 记忆

- **项目列表页**（`/settings/projects`）：无 projectId 依赖，展示当前用户所有项目。
- **其他 3 页**（`/settings/members`、`/settings/tokens`、`/settings/sourcemaps`）：从 URL `?projectId=xxx` 取值，若缺失则读 cookie `ghc-project`（上次选择），若仍缺失显示"请先选择项目"引导态。
- **项目切换**：Topbar 已有项目选择器占位，后续接入时写 cookie + URL replace。当前 MVP 阶段 `projectId` 默认取第一个项目。

### 3. 页面实现模式

| 页面 | 核心 UI 模式 | 组件 |
|---|---|---|
| `/settings/projects` | 卡片列表 + 创建对话框 + 编辑对话框 + 删除确认 | ProjectCard / CreateProjectDialog / EditProjectDialog |
| `/settings/members` | 表格 + 邀请对话框 + 角色下拉 + 移除确认 | MemberTable / InviteMemberDialog / RoleSelect |
| `/settings/tokens` | 表格 + 创建对话框（一次性显示 key）+ 删除确认 | TokenTable / CreateTokenDialog / SecretDisplay |
| `/settings/sourcemaps` | 按 Release 分组的 Artifact 列表 + 删除确认 | ReleaseList / ArtifactTable |

**共性抽象**：
- `components/settings/confirm-dialog.tsx` — 通用确认弹窗
- `components/ui/dialog.tsx` + `select.tsx` — shadcn/ui 原语补齐
- API 客户端统一三态模式 `source: "live" | "empty" | "error"`

### 4. 服务端 vs 客户端渲染选择

- **项目列表页**：Server Component（无交互状态，SSR fetch）
- **成员/Token/Sourcemap 页面**：混合模式 — Server Component 做首屏 fetch，表格/对话框为 Client Component（CRUD 交互需要状态管理）
- 写操作（创建/更新/删除）使用 Client-side fetch + `useRouter().refresh()` 刷新服务端数据

## 备选方案

### 方案 B：Sourcemap 前端直接使用 API Key

前端在 Token 页面获取 secretKey 后，用 `X-Api-Key` 直接调用 `/sourcemap/v1/releases`。

**否决理由**：
- secretKey 暴露到浏览器 localStorage 不安全
- 用户创建 token 后才能查看 sourcemap，UX 割裂
- 违反前端统一 JWT 的设计原则

### 方案 C：projectId 全部走 env 变量

继续使用 `NEXT_PUBLIC_DEFAULT_PROJECT_ID` 硬编码。

**否决理由**：
- 多项目场景完全不可用
- Settings 本身就是管理多项目的入口，硬编码自相矛盾

## 影响

- **SPEC**：新增 3 个 Dashboard 端点（`/dashboard/v1/settings/sourcemaps/*`）
- **ARCHITECTURE**：DashboardModule settings 子目录落地
- **apps/server**：新增 `dashboard/settings/sourcemap.controller.ts` + `sourcemap.service.ts`（极薄代理层，~80 行）
- **apps/web**：4 个页面 + 4 个 API 客户端 + ~8 个组件 + 2 个 UI 原语
- **nav.ts**：4 个 settings 菜单 `placeholder` 清空为 `null`

## 后续

- [ ] 实现完成后补充 demo 路径 + apps/docs 页面链接
- [ ] Topbar 项目切换器完整实现（当前 MVP 取第一个项目）
- [ ] Settings/alerts + channels（Phase 4）、settings/ai（Phase 5）后续各自独立 ADR
