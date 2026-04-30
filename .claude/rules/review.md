# 审查规则

> 本文件由 Claude Code 自动加载，指导代码审查和质量把关。
> 每次代码变更（新增、修改、重构）必须逐项检查。

## 必查项

### 1. 类型安全

- [ ] 无 `any` / `@ts-ignore` / `as unknown as`
- [ ] 函数参数和返回值有显式类型标注
- [ ] API 入参/出参使用 Zod Schema 定义，类型通过 `z.infer<>` 导出
- [ ] 不存在手写的重复类型（应从 Schema 推导）

### 2. 架构合规

- [ ] import 路径符合包依赖规则（见 `architecture.md`）
- [ ] 无循环依赖
- [ ] apps 之间不直接引用，通过 shared 共享类型，通过队列通信
- [ ] NestJS 模块间通过 DI 注入 Service，禁止直接导入 Controller
- [ ] SDK 代码无 Node.js API 调用（浏览器兼容）
- [ ] 环境变量通过 Zod Schema 校验，不直接访问 `process.env`

### 3. 错误处理

- [ ] 无空 catch 块
- [ ] 业务错误使用 `AppException` 类
- [ ] BullMQ Worker 有合理的重试策略
- [ ] 异步函数的错误有合理传播路径

### 4. 安全

- [ ] 无硬编码密钥 / Token / API Key
- [ ] `.env` 相关文件不会被提交（已在 `.gitignore`）
- [ ] 用户输入有校验（Zod Schema / NestJS Pipe）
- [ ] DSN 的 publicKey 不包含 secret 信息

### 5. 代码质量

- [ ] 不可变数据使用 `readonly` 修饰
- [ ] 优先 `const`，避免 `let`
- [ ] 无未使用的变量 / import / 函数
- [ ] 函数职责单一

### 6. 文档与注释

- [ ] 公开 API 有 JSDoc
- [ ] NestJS Controller 有 `@nestjs/swagger` 装饰器
- [ ] 注释使用中文
- [ ] 注释说明"为什么"，而非"做什么"
- [ ] 新增模块/包已更新 `docs/ARCHITECTURE.md`

### 7. 包规范

- [ ] 新增 package 有 `exports` 字段配置
- [ ] 库包使用 Vite Library Mode 构建
- [ ] `packages/shared` 无运行时副作用
- [ ] SDK 包体积 < 10KB gzip（如有变更需验证）

### 8. 测试文件放置

- [ ] 测试文件全部位于对应包/应用的 `tests/` 目录下
- [ ] `src/**/*.{test,spec}.{ts,tsx}` 不存在（散落即违规）
- [ ] `tests/` 目录结构镜像 `src/`，命名保留 `.test.ts` / `.spec.ts` 后缀

### 9. Demo 场景 + 使用文档 + 项目文档（需求级交付强制项）

> 每完成一个**用户可感知的需求**（新增 SDK 能力 / 新增接口 / 新增页面 / 新增通知渠道等），必须顺序完成以下三步；纯内部重构 / 文档勘误可豁免。

**Step 1 · Demo 测试场景（`examples/nextjs-demo/`）**

- [ ] 新建或扩展一个**独立测试场景**（页面 / 路由 / 按钮），开发者通过 `pnpm dev:demo` 即可一键触发并观察到完整链路效果
- [ ] 场景归入既有分组目录（`performance` / `errors` / `api` / `resources` / `tracking` / `custom` 等），保持目录结构与 dashboard 菜单一致
- [ ] 场景注释说明触发路径（DevTools → Network 看什么、Dashboard 去哪个页面验证）
- [ ] 若引入新分组，在 demo 的左侧菜单 / 首页分组列表中登记

**Step 2 · 使用说明（`apps/docs/` Rspress 站点）**

- [ ] 在 `apps/docs/docs/` 对应章节新增或追加 How-to 页面（落点依能力类型选择）：
  - SDK 能力 → `apps/docs/docs/sdk/<plugin>.mdx`
  - 后端 API → `apps/docs/docs/reference/api.mdx`（或 `reference/<module>.mdx`）
  - 后台页面 → `apps/docs/docs/guide/dashboard/<slug>.mdx`
  - 快速接入类入口 → `apps/docs/docs/quickstart/*.mdx`
- [ ] 使用说明包含：**能力简介 + 最小代码/截图 + 配置项 + 常见问题**
- [ ] 若新增 Rspress 页面，同步更新 `apps/docs/rspress.config.ts` 或自动侧边栏对应的 `_meta.json`

**Step 3 · 项目文档传导**

按相关性从上至下补齐（不相关的可跳过，但需心里过一遍）：

- [ ] `docs/PRD.md` / `docs/SPEC.md` / `docs/ARCHITECTURE.md` / `docs/DESIGN.md` —— 契约 / 架构 / 路由清单级变化
- [ ] `docs/decisions/NNNN-*.md` —— 新增 ADR，「后续」章节引用 demo 路径 + apps/docs 页面链接
- [ ] `docs/tasks/CURRENT.md` —— 对应任务状态 `[~]` → `[x]` + 完成日期；更新 "当前焦点"
- [ ] `GETTING_STARTED.md` —— 本地联调 / SDK 接入 / 运维小节如涉及需同步
- [ ] `README.md` —— 仅当新增能力改变了项目对外描述时更新
- [ ] `CLAUDE.md` / `AGENTS.md` —— 仅当新增了 AI 工具必须遵守的新规则 / 新命令时更新

**双向可追溯**（强制）：
- [ ] ADR 的「后续」章节同时指向 **demo 路径** 与 **apps/docs 页面**
- [ ] demo 场景文案（页面标题 / 注释）反向引用 apps/docs 页面链接或 ADR 编号

## 常见问题速查

| 问题 | 修复方式 |
|---|---|
| apps/A 直接 import apps/B | 提取共享类型到 `packages/shared`，通过 BullMQ 队列通信 |
| SDK 中使用了 Node.js API | 替换为浏览器兼容的 Web API |
| 队列名硬编码在 Worker 中 | 移至 `packages/shared` 统一定义常量 |
| Zod Schema 和手写 type 并存 | 删除手写 type，改用 `z.infer<typeof XxxSchema>` |
| 环境变量直接 `process.env.XXX` | 通过 Zod Schema 校验后使用（NestJS: `@nestjs/config`） |
| NestJS Controller 缺少 Swagger | 添加 `@ApiTags` + `@ApiOperation` + `@ApiResponse` 装饰器 |
| 模块间直接导入 Controller | 改为导入 Service，通过 Module exports 暴露 |
| 测试文件放在 `src/` 下 | 迁移到 `<package>/tests/`，保留镜像路径和 `.test.ts` / `.spec.ts` 后缀 |
| 新需求交付后没有 demo 场景 | 在 `examples/nextjs-demo/` 对应分组目录新建独立测试场景（页面 / 路由 / 按钮），确保 `pnpm dev:demo` 一键可触发 |
| 新需求交付后缺使用文档 | 在 `apps/docs/docs/` 对应章节（sdk / reference / guide/dashboard / quickstart）补 How-to 页面，含简介 + 最小示例 + 配置项 |
| 新需求交付后项目文档未传导 | 按相关性顺序检查：PRD/SPEC/ARCHITECTURE/DESIGN → ADR → CURRENT.md → GETTING_STARTED → README → CLAUDE/AGENTS，有契约/架构变化必须同步 |
