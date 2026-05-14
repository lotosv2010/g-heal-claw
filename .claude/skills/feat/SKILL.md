---
name: feat
description: |
  端到端需求交付流程，覆盖全生命周期：需求分析 → ADR 方案设计 → 任务拆解 → 逐任务实现 → 测试用例设计 → Code Review。
  当用户提到以下任意内容时触发：
  - "新需求 / 新功能 / 实现需求 / 需求交付 / 做一个功能"
  - "分析需求 / 拆分任务 / 写 PRD / 写 ARD / 设计接口"
  - "帮我实现 / 开发 / 编码这个功能"
  - "写测试用例 / 单元测试 / 集成测试"
  - "Code Review / CR / 审查代码 / 帮我 review"
  即使用户只提到单个阶段（如"只帮我写 PRD"），也加载此 Skill 以保持阶段间一致性和可追溯性。
triggers:
  - 新需求
  - 新功能
  - 实现需求
  - 需求交付
  - 做一个功能
  - 分析需求
  - 拆分任务
  - 写PRD
  - 写ARD
  - Code Review
  - CR
  - 代码审查
  - 写测试用例
invocable: true
arguments:
  - name: requirement
    hint: "<需求描述>"
    required: true
capabilities:
  - read
  - write
  - search
  - execute
extensions:
  claude:
    allowed-tools: "Read Write Edit Glob Grep Bash Agent"
---

# 端到端需求交付（feat）

将一句话需求驱动为完整的"分析 → 设计 → 拆解 → 实现 → 测试 → 审查"流程，每阶段有明确质量门和用户确认卡点。

## 用法

```
/feat SDK 新增曝光埋点插件（ExposurePlugin），基于 IntersectionObserver
/feat HealModule 支持 `/heal/issues/:id/retry` 接口，幂等重试 AI 诊断
```

## 流程全景

```
P1:需求理解 → P2:ADR方案设计 → P3:任务拆解 → P4:逐任务实现 → P5:测试用例 → P6:Code Review → P7:交付确认
  5W1H        备选方案+推荐       INVEST+可追溯ID    遵循rules/*      金字塔+六维      六维评分+四级严重度   变更清单+验证状态
  In/Out      写入decisions/     写入CURRENT.md      每任务更新状态   AC覆盖矩阵      Critical归零方可合并   文档传导
```

- **阶段可独立触发**：单阶段触发时先检查前置上下文是否存在
- **反馈闭环**：P6 发现问题回溯至 P4/P5；P1 边界变更重走 P2→P3
- **卡点规则**：每阶段切换前须用户确认（P1 无疑问时可一次确认到 P2）

## 目录结构

```
.claude/skills/feat/
├── SKILL.md                        ← Body（本文件）—— 流程框架 + 质量门 + 卡点规则 + 引用指针
└── references/
    ├── prd-template.md             ← P1/P3 产品需求文档完整模板
    ├── ard-template.md             ← P1/P3 接口需求文档完整模板（含 PRD/ARD/ADR 决策树）
    ├── review-rubric.md            ← P6 评分细则（六维量规 + 严重度速查 + 校准示例 + 反模式清单）
    └── test-patterns.md            ← P5 测试模式库（NestJS/Zod/React/SDK 代码模板 + Mock 策略）
```

> **设计原则（Build Step 2）**：SKILL.md 只写框架型判断。完整模板和评分细则放入 `references/`，按需读取。

---

## Phase 1：需求理解

**目标**：将模糊输入转化为结构化理解，识别歧义和风险。

**方法**：5W1H + In/Out Scope + 假设登记册 + 追问三原则

### 执行步骤

1. **读取上下文**（按序）：`docs/PRD.md` → `docs/SPEC.md` → `docs/ARCHITECTURE.md` → `docs/DESIGN.md` → `docs/tasks/CURRENT.md` → `docs/decisions/` → `.claude/rules/`
2. **5W1H 拆解**：Who（角色）、What（边界）、Why（价值）、When（场景）、Where（模块/队列/表）、How（方向）
3. **识别假设与风险**：标注优先级（高/中/低）
4. **追问**：模糊点选最关键 3 条，不超过 3 条

### 输出要点

- 需求概述（一句话）+ PRD 章节归属（超出标注）
- **In Scope / Out of Scope** 功能边界表格
- 涉及应用/模块、队列、数据表、契约清单
- 假设与风险登记册（编号 + 影响 + 优先级）
- 关键约束（如 SDK 无 Node API、不绕过 GatewayModule）
- 追问清单（≤3 条，有疑问时）

> 完整 PRD/ARD 模板见 [`references/prd-template.md`](references/prd-template.md) 和 [`references/ard-template.md`](references/ard-template.md)。

### 质量门

- [ ] In/Out Scope 明确，高优先级风险已标记，涉及模块/队列/表已识别
- [ ] 有疑问时追问 ≤3 条；无疑问时直接进入 P2（仍输出理解摘要）

---

## Phase 2：方案设计（ADR）

**目标**：产出架构决策记录，作为实现契约。

### 执行步骤

1. 确定 ADR 编号（`docs/decisions/` 最大编号 + 1）。小体量决策可在 `docs/decisions/README.md` 索引表新增一行，不建独立文件
2. 设计 1~3 个备选方案，每个含：技术路径、接口草稿、优缺点/成本/风险、对架构的影响
3. 推荐一个方案（对齐 PRD + 符合架构红线 + 最小变更）
4. 按 `docs/decisions/README.md` 模板写入 ADR + 更新索引
5. 输出 ADR 摘要请求 Review：决策一句话、推荐方案、文件路径、关键影响（SPEC/ARCHITECTURE/模块边界）

### 文档类型决策树

```
需要什么类型的文档？
├─ 涉及 UI/用户交互 → PRD（references/prd-template.md）
├─ 涉及新接口/数据模型/队列 → ARD（references/ard-template.md）
├─ 涉及架构决策（新技术/模块重组/通信模式变更）→ ADR（docs/decisions/）
└─ 轻量变更 → 直接更新 docs/SPEC.md，不建独立文档
```

### 质量门

- [ ] ≥1 备选方案被评估，推荐方案符合架构红线，ADR 已写入 + 索引已更新

**卡点**：须等用户确认 ADR 后才进入 P3。

---

## Phase 3：任务拆解

**目标**：将 ADR 方案拆为可独立交付、有明确 AC 的任务，建立可追溯 ID 链。

**方法**：INVEST + 垂直切片 + 依赖显式化 + 可追溯 ID

### 拆解原则

- **INVEST**：Independent, Negotiable, Valuable, Estimable, Small（≤1d）, Testable
- **垂直切片**：每个 Story 独立交付业务价值，避免纯技术 Task
- **粒度**：≤1 人日（AI 约 1~2 轮对话），底层先于上层（shared Schema → Processor → Controller → UI）
- **测试随功能同步**，SDK 变更须附带体积预算（gzip ≤ 15KB）

### 可追溯 ID 体系

```
REQ-001 → ADR-NNNN → TX.Y.Z（CURRENT.md 任务）→ TC-U01（测试用例）→ CR-C01（CR 问题）
```

### 执行步骤

1. 读取 `docs/tasks/CURRENT.md`，取下一个 `T<Phase>.<M>.<Seq>` 编号
2. 拆解任务，格式：`[ ] TX.Y.Z {标题} — {估时}d` + 输入/输出/Given-When-Then 验收/依赖
3. 写入 CURRENT.md 对应 Milestone，更新"当前焦点"
4. 输出任务清单 + 关键依赖链 + 预估总工时，请求 Review

### 质量门

- [ ] 每个 Story 可独立交付，每个 Task 有 Given/When/Then AC，依赖关系显式标注，ID 无冲突

**卡点**：须等用户确认任务拆解后才进入 P4。

---

## Phase 4：逐任务实现

**目标**：按依赖顺序逐个交付任务。

### 每任务执行流程

1. **切换状态** `[ ]` → `[~]`，更新 CURRENT.md
2. **先读后写**：理解现有实现模式（Zod 命名风格、NestJS 模块组织）
3. **编码 + 测试**：遵循 `.claude/rules/coding.md` + `architecture.md`；测试文件放 `<package>/tests/`，禁止散落 `src/`
4. **本地验证**：`pnpm typecheck && pnpm lint && pnpm test`
5. **自检**：对照 `.claude/rules/review.md` Checklist
6. **Demo + 文档 + 传导**（用户可感知需求必做，详见 `.claude/rules/review.md §9）：
   - Step 1 · `examples/nextjs-demo/` 对应分组新建场景
   - Step 2 · `apps/docs/` 对应章节补 How-to 页面
   - Step 3 · 按序传导 PRD/SPEC/ARCHITECTURE/DESIGN → ADR → CURRENT.md → GETTING_STARTED → README
   - 双向可追溯：ADR「后续」→ demo 路径 + apps/docs 链接
7. **收尾** `[~]` → `[x]` + 日期，更新"当前焦点"
8. **报告完成**，继续下一个任务

### 质量门

- [ ] typecheck/lint/test 全部通过，测试文件在 `tests/`，Demo 和 docs 已建立，文档已传导

**流转规则**：无依赖任务可合并执行；遇阻塞立即暂停询问；**禁止自动 git commit/push**。

---

## Phase 5：测试用例设计

**目标**：确保每条 AC 有对应测试用例，覆盖正常路径、边界、异常。

**方法**：测试金字塔（E2E 10% / 集成 30% / 单元 60%）+ 六维用例设计

> 详细代码模式见 [`references/test-patterns.md`](references/test-patterns.md)。

### 六维用例设计

| 维度 | 核心思路 |
|------|----------|
| **Happy Path** | 正常输入 → 期望输出 |
| **边界值** | 空值 / 零值 / 最大最小值 |
| **异常输入** | 非法类型 / 超长 / 恶意 payload |
| **并发/竞态** | 幂等性 / 重复提交 |
| **权限/安全** | 未授权 401 / 越权 403 |
| **性能边界** | 大数据量 / 高频调用 / 超时 |

### 输出要点

1. **AC 覆盖矩阵**：每条 AC → 单元/集成/E2E 测试映射
2. **单元测试**：覆盖任务 ID + 测试对象 + 维度 + Given-When-Then
3. **集成测试**：模块间交互链路，使用 Dockerized PG（禁止 mock 数据库）
4. **E2E 测试**：用户故事级别场景，对应 AC

### 质量门

- [ ] AC 覆盖 100%，Happy Path + 边界 + 异常三个维度已覆盖
- [ ] 涉及队列/并发有竞态测试，涉及权限有安全测试，测试文件在 `tests/`

---

## Phase 6：Code Review

**目标**：量化评分 + 分级问题 + 改进建议。Critical 归零方可合并。

**方法**：六维评分（/100）+ 四级严重度 + Before/After

> 详细量规（分数段标准 + 检查要点）、校准示例、反模式清单见 [`references/review-rubric.md`](references/review-rubric.md)。

### 评分维度

| 维度 | 权重 | 核心关注点 |
|------|------|-----------|
| 正确性 | 25 | 逻辑缺陷、边界处理、异常传播、幂等性 |
| 可读性 | 20 | 命名自解释、控制流扁平、函数 ≤30 行 |
| 可维护性 | 20 | 单一职责、依赖方向、无重复代码 |
| 安全性 | 15 | 输入校验、密钥管理、权限控制 |
| 性能 | 10 | N+1 查询、并行化、SDK 体积预算 |
| 测试覆盖 | 10 | AC 覆盖完整性、边界用例 |

### 严重度决策树（关键判断）

```
发现问题
├─ Bug / 安全漏洞 / 数据损坏 / 架构红线违反？→ 🔴 Critical（阻塞合并）
├─ 影响可维护性/性能/扩展性？→ 🟠 Major（强烈建议）
├─ 代码质量可后续改进？→ 🟡 Minor（建议）
└─ 风格/习惯问题？→ 🔵 Nitpick（可选）
```

**速查**：`any`/空 catch/apps 间 import/硬编码密钥/SQL 注入/SDK 引 Node API → 🔴；队列名硬编码/N+1/手写类型代替 `z.infer<>`/测试文件在 `src/` → 🟠

### 输出要点

- 综合评分（六维表格 + 总分 + 评级）：≥90 ✅ / 75-89 🟡 / 60-74 🟠 / <60 🔴
- 问题清单按严重度分组，每个附 `[CR-Cxx]` 编号 + 文件:行号 + Before/After
- 亮点至少 1 条
- 行动项分 Blocker / Non-blocker

### 质量门

- [ ] 六维均已打分（附评语），Critical = 0，总分 ≥ 75，每扣分项附 Before/After

**卡点**：有 Critical 时须修复后重审。

---

## Phase 7：交付确认

全部任务完成后输出交付摘要：

- **可追溯链路**：REQ → ADR → Tasks → TCs → CRs（全部 Closed）
- **变更清单**：新增/修改文件列表
- **契约影响**：SPEC / ARCHITECTURE / DESIGN 更新状态表
- **Demo + docs**：场景路径 + 触发方式 + 使用说明落点
- **文档传导状态表**：PRD/SPEC/ARCHITECTURE/DESIGN/ADR/CURRENT/GETTING_STARTED/README/CLAUDE/AGENTS
- **验证状态**：typecheck / lint / test / SDK 体积预算
- **CR 结果**：总分 / Critical / Major / 评级

---

## 跨阶段可追溯性

```
REQ-001 → ADR-NNNN → TX.Y.Z（CURRENT.md）→ TC-U01（测试）→ CR-C01（CR问题）
```

- P3 输出时建立 REQ → ADR → Task 链路
- P5 输出时建立 Task → TC 映射（AC 覆盖矩阵）
- P6 输出时 CR 问题关联到具体 TC 或 Task
- P7 交付摘要汇总完整链路

---

## 约束

- 遵循 `.claude/rules/` 所有硬性规则
- ADR 使用 `docs/decisions/README.md` 模板；任务 ID 遵循 `T<Phase>.<M>.<Seq>` 格式
- 测试文件必须位于 `<package>/tests/`，禁止散落 `src/`
- 不自动 `git commit` / `git push` / 分支操作
- 需求超出 PRD 范围时先确认是否扩展 PRD
- 单阶段触发时先检查前置上下文
- 各阶段输出均携带可追溯 ID
