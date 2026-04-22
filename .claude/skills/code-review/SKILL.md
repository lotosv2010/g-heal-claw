---
name: code-review
description: 对当前变更执行结构化代码审查，覆盖架构合规、类型安全、错误处理等维度。适用于提交前的质量把关。
argument-hint: "[文件路径或 git diff 范围，留空则审查所有未提交变更]"
disable-model-invocation: false
allowed-tools: Read Grep Glob Bash(git diff*) Bash(git status*) Bash(git log*)
---

# 代码审查

## 审查范围

```!
git diff --stat HEAD
```

```!
git status --short
```

**指定范围：** $ARGUMENTS

---

## 执行步骤

### 1. 加载审查规则

读取项目审查标准：

- `.claude/rules/review.md` — 审查 checklist
- `.claude/rules/architecture.md` — 架构红线
- `.claude/rules/coding.md` — 代码规范

### 2. 变更分析

读取所有变更文件的完整内容，理解变更意图：

- 逐文件阅读 diff，理解**做了什么**和**为什么**
- 识别变更类型：新增功能 / 重构 / 修复 / 配置变更
- 标注影响范围：仅限包内 / 跨包 / 跨服务

### 3. 逐维度审查

按以下维度逐项检查，每个维度输出 PASS / WARN / FAIL：

#### 3.1 类型安全

- [ ] 无 `any` / `@ts-ignore` / `as unknown as`
- [ ] API 入参/出参使用 Zod Schema
- [ ] 类型通过 `z.infer<>` 导出

#### 3.2 架构合规

- [ ] import 路径符合包依赖规则
- [ ] 无循环依赖
- [ ] apps 之间不直接引用
- [ ] SDK 无 Node.js API

#### 3.3 错误处理

- [ ] 无空 catch 块
- [ ] 业务错误使用 `AppError`
- [ ] Worker 有重试策略

#### 3.4 安全

- [ ] 无硬编码密钥
- [ ] 用户输入有 Zod 校验

#### 3.5 代码质量

- [ ] 优先 `const`，避免 `let`
- [ ] 无未使用的变量 / import
- [ ] 函数职责单一

#### 3.6 文档与注释

- [ ] 公开 API 有 JSDoc
- [ ] 注释使用中文
- [ ] 新增服务/包已更新架构文档

### 4. 输出报告

```markdown
## 审查报告

**变更概述：** {一句话描述变更内容}
**文件数量：** {N} 个文件变更

### 审查结果

| 维度 | 结果 | 说明 |
|------|------|------|
| 类型安全 | PASS/WARN/FAIL | {简要说明} |
| 架构合规 | PASS/WARN/FAIL | {简要说明} |
| 错误处理 | PASS/WARN/FAIL | {简要说明} |
| 安全 | PASS/WARN/FAIL | {简要说明} |
| 代码质量 | PASS/WARN/FAIL | {简要说明} |
| 文档注释 | PASS/WARN/FAIL | {简要说明} |

### 问题清单

#### FAIL（必须修复）
- `文件:行号` — {问题描述} → {修复建议}

#### WARN（建议修复）
- `文件:行号` — {问题描述} → {修复建议}

### 总结

- **是否可提交：** 是 / 否
- **改进建议：** {整体性建议}
```

> 注意：本 skill 仅做审查，不自动修改代码。如需修复，由用户确认后手动执行。
