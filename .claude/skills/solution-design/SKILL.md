---
name: solution-design
description: 基于已拆解的任务清单，输出技术方案设计（模块划分、接口契约、数据流、文件清单）。适用于开发前的方案评审。
argument-hint: <任务描述或 CURRENT.md 中的任务 ID>
disable-model-invocation: false
allowed-tools: Read Grep Glob
---

# 方案设计

为以下任务设计技术实现方案：

**设计目标：** $ARGUMENTS

---

## 执行步骤

### 1. 上下文加载

读取项目文档和代码，建立技术认知：

- `docs/SPEC.md` — 技术规格（API 契约、数据模型）
- `docs/ARCHITECTURE.md` — 系统架构（服务拓扑、数据流）
- `docs/DESIGN.md` — 技术设计（模式、约定）
- `docs/tasks/CURRENT.md` — 任务详情
- `.claude/rules/architecture.md` — 架构红线
- `.claude/rules/coding.md` — 代码规范

浏览相关源码，理解现有实现模式：

- `packages/shared/src/` — 现有共享类型和 Schema
- `apps/*/src/` — 现有服务实现

### 2. 架构决策

对每个需要决策的技术点，按 ADR 格式输出：

```markdown
#### ADR-XX: {决策标题}

- **背景：** {为什么需要这个决策}
- **选项：**
  - A: {方案 A} — 优: ... / 劣: ...
  - B: {方案 B} — 优: ... / 劣: ...
- **决策：** {选择哪个，为什么}
- **后果：** {对现有代码的影响}
```

### 3. 模块设计

对每个新增 / 修改的包或服务，输出：

```markdown
#### {包/服务名}（`apps/{name}/` 或 `packages/{name}/`）

**职责：** {一句话说明}

**公开接口：**
- `functionName(params): ReturnType` — {说明}

**Zod Schema：**
- `XxxSchema` — {字段说明}

**依赖：** shared, redis, postgres 等
**不依赖：** {明确列出不应依赖的包}
```

### 4. 数据流设计

用文本流程图描述核心数据流：

```
用户操作
  → {入口}
    → {队列/服务调用}
      → {数据库/外部 API}
    ← {返回}
  ← {响应}
```

标注每个节点的文件位置和关键函数名。

### 5. 文件清单

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 新增 | `apps/{name}/src/server.ts` | {说明} |
| 新增 | `packages/shared/src/schemas/xxx.ts` | {说明} |
| 修改 | `docs/ARCHITECTURE.md` | 更新服务拓扑 |

### 6. 合规性检查

对照架构规则逐项验证方案：

- [ ] 服务边界清晰，职责单一
- [ ] 服务间通过 BullMQ 队列异步通信
- [ ] 共享类型在 `packages/shared` 中定义
- [ ] API 入参/出参使用 Zod Schema
- [ ] 环境变量通过 Zod Schema 校验
- [ ] 无循环依赖
- [ ] SDK 代码无 Node.js API

### 7. 输出产物

1. **架构决策**（ADR 格式）
2. **模块设计**（接口 + Schema + 依赖）
3. **数据流图**
4. **文件清单**（新增 / 修改）
5. **合规性检查结果**

> 注意：本 skill 仅做方案设计，不执行代码编写。方案确认后手动开发。
