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

### 9. Demo 场景 + 使用文档（需求级交付强制项）

> 每完成一个**用户可感知的需求**（新增 SDK 能力 / 新增接口 / 新增页面 / 新增通知渠道等），必须同步补齐以下两项；纯内部重构 / 文档勘误可豁免。

- [ ] **Demo 场景**：在 `examples/nextjs-demo/` 对应分组（`performance` / `errors` / `api` / `resources`）下补一个**最小可触发**的用例，并接入 `demo-scenarios.ts` 单一数据源，让开发者可在 `pnpm dev:demo` 中一键复现
- [ ] **使用说明**：在 `docs/` 中补一段 How-to（落点视需求而定）：
  - SDK 能力 → `GETTING_STARTED.md §7 SDK 接入` 子节
  - 后端 API → `docs/SPEC.md` 接口章节 + 示例 curl
  - 后台页面 → `docs/ARCHITECTURE.md §5.1` 路由清单加 ✅ 标记 + 字段含义段
  - 新模块 / 队列 / 数据表 → `docs/ARCHITECTURE.md` 对应清单 + ADR 后续小节
- [ ] **双向可追溯**：ADR 的「后续」章节引用了 demo 路径与文档落点；demo README 或页面文案引用了 ADR / 文档链接

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
| 新需求交付后没有 demo 场景 | 在 `examples/nextjs-demo/app/demo-scenarios.ts` 对应分组补最小用例，确保 `pnpm dev:demo` 可一键触发 |
| 新需求交付后文档缺使用说明 | 按能力落点补：SDK → `GETTING_STARTED §7`；接口 → `docs/SPEC.md`；页面 → `docs/ARCHITECTURE.md §5.1`；模块 → ARCHITECTURE 模块清单 + ADR 后续 |
