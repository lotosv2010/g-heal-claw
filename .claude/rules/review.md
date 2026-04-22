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
- [ ] SDK 代码无 Node.js API 调用（浏览器兼容）
- [ ] 环境变量通过 Zod Schema 校验，不直接访问 `process.env`

### 3. 错误处理

- [ ] 无空 catch 块
- [ ] 业务错误使用 `AppError` 类
- [ ] Worker 任务有合理的重试策略
- [ ] 异步函数的错误有合理传播路径

### 4. 安全

- [ ] 无硬编码密钥 / Token / API Key
- [ ] `.env` 相关文件不会被提交（已在 `.gitignore`）
- [ ] 用户输入有校验（Zod Schema）
- [ ] DSN 的 publicKey 不包含 secret 信息

### 5. 代码质量

- [ ] 不可变数据使用 `readonly` 修饰
- [ ] 优先 `const`，避免 `let`
- [ ] 无未使用的变量 / import / 函数
- [ ] 函数职责单一

### 6. 文档与注释

- [ ] 公开 API 有 JSDoc
- [ ] 注释使用中文
- [ ] 注释说明"为什么"，而非"做什么"
- [ ] 新增服务/包已更新 `docs/ARCHITECTURE.md`

### 7. 包规范

- [ ] 新增 package 有 `exports` 字段配置
- [ ] 库包使用 Vite Library Mode 构建
- [ ] `packages/shared` 无运行时副作用
- [ ] SDK 包体积 < 10KB gzip（如有变更需验证）

## 常见问题速查

| 问题 | 修复方式 |
|---|---|
| apps/A 直接 import apps/B | 提取共享类型到 `packages/shared`，通过 BullMQ 队列通信 |
| SDK 中使用了 Node.js API | 替换为浏览器兼容的 Web API |
| 队列名硬编码在 Worker 中 | 移至 `packages/shared` 统一定义常量 |
| Zod Schema 和手写 type 并存 | 删除手写 type，改用 `z.infer<typeof XxxSchema>` |
| 环境变量直接 `process.env.XXX` | 通过 `src/env.ts` 的 Zod Schema 校验后使用 |
| 新服务未注册健康检查 | 添加 `GET /health` 端点 |
