# 任务跟踪

> 最后更新: 2026-04-22

## 状态说明

- `[ ]` 待开始
- `[~]` 进行中
- `[x]` 已完成
- `[-]` 已跳过/推迟

---

## Phase 1: 基础设施 & MVP（第 1-6 周）

**目标**: SDK 捕获错误 → 后端采集处理 → Sourcemap 还原堆栈 → Dashboard 展示异常

### M1.1 项目脚手架

- [x] **T1.1.1** Monorepo 初始化（pnpm workspace + Turborepo + tsconfig）— 2d
- [x] **T1.1.2** Docker Compose（PostgreSQL + Redis + MinIO）— 2d
- [ ] **T1.1.3** NestJS server 应用初始化（Fastify adapter + 模块骨架 + 环境变量 Zod 校验）— 2d
- [ ] **T1.1.4** 数据库 Schema & 迁移（Drizzle ORM，含 Release/Environment/ProjectMember 表）— 3d
- [ ] **T1.1.5** shared 包（Zod Schema + 队列名常量 + 通用工具函数）— 2d
- [ ] **T1.1.6** Next.js web 应用初始化（App Router + TailwindCSS v4 + Shadcn/ui）— 2d

### M1.2 SDK 核心

- [ ] **T1.2.1** SDK 初始化 & 配置（`GHealClaw.init()`, DSN 解析, 采样率）— 2d
- [ ] **T1.2.2** 全局错误捕获（`window.onerror` + `unhandledrejection`）— 2d
- [ ] **T1.2.3** 上下文收集（浏览器/OS/用户/自定义数据）— 2d
- [ ] **T1.2.4** 传输层（HTTP 批量发送, 重试退避, Beacon API）— 3d
- [ ] **T1.2.5** 手动捕获 API（`captureException`, `captureMessage`）— 1d
- [ ] **T1.2.6** 面包屑（console/DOM 点击/XHR/fetch/导航）— 3d
- [ ] **T1.2.7** 构建 & 发布（Vite lib mode: ESM/CJS/IIFE, < 10KB gzip）— 2d

### M1.3 数据采集（server/GatewayModule）

- [ ] **T1.3.1** `POST /api/v1/events` 端点（Zod 校验, DSN 认证 Guard）— 2d
- [ ] **T1.3.2** 限流（Redis 令牌桶, 按项目配置, NestJS Guard）— 2d
- [ ] **T1.3.3** 事件入队（BullMQ `error-events` 队列）— 1d
- [ ] **T1.3.4** 健康检查 & Swagger 文档（`@nestjs/swagger`）— 1d

### M1.4 Sourcemap 服务（server/SourcemapModule）

- [ ] **T1.4.1** 上传 API（`POST /api/v1/sourcemaps`, multipart, MinIO 存储, 关联 Release）— 3d
- [ ] **T1.4.2** CLI 工具（`npx @g-heal-claw/cli upload-sourcemaps`）— 2d
- [ ] **T1.4.3** Vite 构建插件（自动上传 sourcemap）— 2d
- [ ] **T1.4.4** 堆栈解析引擎（`source-map` 库, Redis 缓存）— 4d
- [ ] **T1.4.5** 存储生命周期（90 天保留, 自动清理）— 2d

### M1.5 错误处理（server/ProcessorModule）

- [ ] **T1.5.1** BullMQ Worker（消费 `error-events` 队列, NestJS `@Processor` 装饰器）— 2d
- [ ] **T1.5.2** 错误指纹算法（SHA256: 类型 + 归一化前 5 帧）— 3d
- [ ] **T1.5.3** Issue 聚合（指纹匹配 → 累加或新建, Release/Environment 关联）— 2d
- [ ] **T1.5.4** 堆栈解析集成（调用 SourcemapModule.resolve()，进程内）— 2d
- [ ] **T1.5.5** 严重等级分类（按类型/频率自动分级）— 2d

### M1.6 后台管理 Dashboard MVP

- [ ] **T1.6.1** 认证系统（NextAuth.js 或 JWT, 注册/登录/刷新）— 3d
- [ ] **T1.6.2** server/DashboardModule REST API（项目 CRUD/成员管理/Issue CRUD）— 3d
- [ ] **T1.6.3** 项目管理页（CRUD/DSN 展示/团队成员/Release 列表）— 3d
- [ ] **T1.6.4** 异常列表页（分页/排序/筛选, 按 Environment 过滤）— 3d
- [ ] **T1.6.5** 异常详情页（解析后堆栈/面包屑/浏览器分布/事件时间线）— 4d
- [ ] **T1.6.6** 异常状态管理（解决/忽略/回归检测）— 2d

---

## Phase 2: AI 诊断 & 通知（第 7-10 周）

**目标**: 异常自动 AI 分析并输出 Markdown 方案，多渠道通知相关人

### M2.1 AI Agent（apps/ai-agent）

- [ ] **T2.1.1** ai-agent 应用初始化（LangChain + BullMQ Worker + 环境变量校验）— 2d
- [ ] **T2.1.2** LLM Provider 配置（Claude/GPT 可切换, 项目级别配置）— 2d
- [ ] **T2.1.3** 诊断 Agent + Tools（read_source / read_breadcrumbs / search_similar）— 5d
- [ ] **T2.1.4** 诊断触发 & 队列（新 Issue → ai-diagnosis 队列 → Agent 消费）— 2d
- [ ] **T2.1.5** 诊断结果展示（Next.js 页面 Markdown 渲染 + 代码高亮）— 2d
- [ ] **T2.1.6** 反馈闭环（有用/无用/部分有用评分）— 2d
- [ ] **T2.1.7** 成本追踪（Token 用量/月度预算/超限暂停）— 2d

### M2.2 通知服务（server/NotificationModule）

- [ ] **T2.2.1** 通知规则引擎（触发条件 + 渠道 + 条件过滤, NestJS Service）— 3d
- [ ] **T2.2.2** 邮件通知（HTML 模板, SMTP/SendGrid）— 2d
- [ ] **T2.2.3** Slack 集成（Rich Message + 交互按钮）— 2d
- [ ] **T2.2.4** 通用 Webhook（JSON POST, HMAC 签名, 重试）— 1d
- [ ] **T2.2.5** 钉钉集成（Robot Webhook, Markdown 消息）— 1d
- [ ] **T2.2.6** 去重 & 限频（冷却期/突发聚合）— 2d

---

## Phase 3: 自动修复管线（第 11-16 周）

**目标**: 自动生成代码修复 → 创建 PR → 人工审批 → 触发部署

### M3.1 Git 集成（ai-agent Tools 扩展）

- [ ] **T3.1.1** 仓库连接（GitHub/GitLab OAuth 或 PAT, server/DashboardModule 管理）— 3d
- [ ] **T3.1.2** Tool: git_clone（浅克隆 + release tag + 缓存）— 2d
- [ ] **T3.1.3** Tool: read_file（GitHub/GitLab API 单文件获取）— 2d

### M3.2 自动修复（ai-agent Agent 扩展）

- [ ] **T3.2.1** Tool: apply_patch（AI 生成 unified diff, 验证可应用）— 4d
- [ ] **T3.2.2** Tool: run_sandbox（Docker 隔离, lint + tsc 验证, 资源限制）— 4d
- [ ] **T3.2.3** Tool: create_pr（分支/提交/推送/PR 描述含诊断 Markdown）— 3d
- [ ] **T3.2.4** 修复 Agent 编排（ReAct 循环: patch → validate → retry → PR）— 3d
- [ ] **T3.2.5** 修复审批流程（Next.js Diff 查看器/批准/拒绝）— 3d

### M3.3 部署触发

- [ ] **T3.3.1** GitHub Actions 集成（API 触发/状态监控）— 2d
- [ ] **T3.3.2** GitLab CI 集成 — 2d
- [ ] **T3.3.3** 通用 CI Webhook 触发 — 1d
- [ ] **T3.3.4** 部署状态追踪（全生命周期 → Issue 状态更新）— 2d

---

## Phase 4: 分析、打磨 & 扩展（第 17-22 周）

**目标**: 丰富的分析图表，高性能扩展，生产级加固

### M4.1 分析 & 图表

- [ ] **T4.1.1** 错误趋势图（ECharts 时间线: 项目/Issue/严重等级维度）— 3d
- [ ] **T4.1.2** 浏览器/OS/设备分布图 — 2d
- [ ] **T4.1.3** 用户影响指标（受影响用户数/无错误会话比例）— 2d
- [ ] **T4.1.4** 版本对比（Release 实体支撑的错误率对比/回归标识）— 3d
- [ ] **T4.1.5** AI 诊断效果指标（修复采纳率/评分统计）— 2d
- [ ] **T4.1.6** 自定义仪表盘（拖拽布局/保存/分享）— 5d

### M4.2 性能 & 扩展

- [ ] **T4.2.1** 采集优化（10k events/s, p99 < 100ms）— 3d
- [ ] **T4.2.2** ClickHouse 集成（100M+ 行亚秒级分析查询）— 5d
- [ ] **T4.2.3** 数据保留 & 归档（冷存储 + 可配置策略）— 3d
- [ ] **T4.2.4** NestJS 模块拆分为独立微服务（按需） — 5d

### M4.3 生产加固

- [ ] **T4.3.1** 端到端加密（TLS + 静态加密）— 3d
- [ ] **T4.3.2** 审计日志 — 2d
- [ ] **T4.3.3** RBAC 细化（Owner/Admin/Member/Viewer, 基于 ProjectMember）— 2d
- [ ] **T4.3.4** API 文档完善（`@nestjs/swagger` 全覆盖）— 2d
- [ ] **T4.3.5** 测试套件（单元 90%+ / 集成 / E2E）— 8d

---

## 验收标准

### Phase 1 验收
- SDK 在测试应用中捕获未捕获异常
- 事件到达 Gateway 并返回 202
- Error Processor 创建带有解析后堆栈的 Issue
- Dashboard 展示 Issue 及原始源码位置

### Phase 2 验收
- 新 Issue 在 60 秒内触发 AI 诊断
- Issue 详情页展示 Markdown 格式的诊断方案
- 通知发送至已配置的 Slack/邮件/钉钉渠道

### Phase 3 验收
- AI 对已诊断 Issue 生成 unified diff 修复
- 修复通过沙箱验证（lint + 类型检查）
- 修复以诊断描述创建 PR 到关联仓库
- Owner 在 Dashboard 审批 → 触发部署

### Phase 4 验收
- 分析图表基于真实事件数据渲染
- 压测确认 10k events/s 采集吞吐量
- ClickHouse 分析查询在 100M+ 行数据上 < 500ms
- 所有 API 端点有 Swagger 文档

---

## 统计

| 指标 | 值 |
|---|---|
| 总任务数 | 58 |
| 已完成 | 2 |
| 进行中 | 0 |
| 预估总工期 | ~22 周（3-4 名工程师） |
| 当前阶段 | Phase 1 — M1.1 项目脚手架 |
| 下一任务 | T1.1.3 NestJS server 应用初始化 |
