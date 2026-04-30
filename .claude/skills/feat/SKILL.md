---
name: feat
description: 端到端需求交付流程：需求理解 → ADR 设计 → 任务拆解 → 用户 Review → 逐任务实现。输入需求描述即驱动全流程。
triggers:
  - 新需求
  - 新功能
  - 实现需求
  - 需求交付
  - 做一个功能
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

将一句话需求驱动成完整的"设计 → 拆解 → 实现"流程，强制每个阶段都有用户确认卡点，避免 AI 直接开写导致方向错误。

## 用法

```
/feat SDK 新增曝光埋点插件（ExposurePlugin），基于 IntersectionObserver
/feat HealModule 支持 `/heal/issues/:id/retry` 接口，幂等重试 AI 诊断
/feat 新增钉钉群自定义机器人通知渠道，复用现有 NotificationModule 协议
```

## 流程概览

```
Phase 1: 需求理解 ──→ Phase 2: 方案设计（ADR）──→ Phase 3: 任务拆解
     │                       │                           │
     ▼                       ▼                           ▼
  读取 PRD/SPEC/         写入 docs/decisions/      更新 docs/tasks/CURRENT.md
  ARCHITECTURE/          等待用户 Review            等待用户 Review
  DESIGN/CURRENT         ↻ 修改直至确认              ↻ 修改直至确认
  需求复述确认                                           │
                                                         ▼
                                             Phase 4: 逐任务实现
                                                  遵循 .claude/rules/*
                                                  每任务完成后更新 CURRENT.md
                                                         │
                                                         ▼
                                                Phase 5: 交付确认
```

## Phase 1：需求理解

**目标**：确保对需求的理解与用户完全一致，避免方向偏差。

**步骤：**

1. 按文档层级顺序读取上下文（**PRD → SPEC → ARCHITECTURE → DESIGN**）：
   - `docs/PRD.md` — 确认需求是否在 PRD 范围内（如不在，需用户确认是新增需求）
   - `docs/SPEC.md` — 现有契约（SDK API / HTTP 路由 / 数据模型 / 告警 DSL）
   - `docs/ARCHITECTURE.md` — 模块边界、队列清单、数据流
   - `docs/DESIGN.md` — 技术选型与设计模式
   - `docs/tasks/CURRENT.md` — 当前活跃任务（避免冲突与重复）
   - `docs/decisions/` — 相关 ADR（已有决策不推翻）
   - `.claude/rules/architecture.md` / `coding.md` — 硬性规则

2. 识别受影响的模块、队列、数据表、对外契约。

3. 输出需求理解确认：

```markdown
## 需求理解

**需求概述**：[一句话总结]

**所属 PRD 章节**：[如 §2.2 异常监控 / §2.7 埋点；若超出 PRD 范围明确标注]

**涉及应用 / 模块**：
- [apps/xxx 或 模块名] — [影响说明]

**涉及队列 / 数据表 / 契约**：
- [events-error / issues 表 / /ingest/v1/events 等]

**关键约束**：
- [SDK 不能引入 Node.js API]
- [不得绕过 GatewayModule 直写数据库]

**疑问（如有）**：
- [问题 1]

理解正确吗？确认后进入方案设计阶段（Phase 2）。
```

**卡点规则**：
- 有疑问必须等用户回答后继续。
- 无疑问且需求明确时可直接进入 Phase 2，但仍应输出理解摘要供用户秒读校验。

## Phase 2：方案设计（ADR）

**目标**：产出架构决策记录，作为实现的契约。

**步骤：**

1. **确定 ADR 编号**：读取 `docs/decisions/` 取最大编号 + 1（四位递增，如 `ADR-0009`）。若决策体量较小、不足以独立 ADR，可在 `docs/decisions/README.md` 索引表中新增一行即可，并在本阶段明确说明"本次决策不新建 ADR 文件"。

2. **设计 1~3 个备选方案**，每个方案包含：
   - 技术路径与关键接口草稿
   - 优点 / 缺点 / 成本 / 风险
   - 对现有架构的影响（模块边界、队列、数据库、依赖方向）

3. **推荐一个方案**并说明理由（对齐 PRD 价值 + 符合架构红线 + 最小变更）。

4. **写入 ADR 文件**（使用 `docs/decisions/README.md` 给出的模板）：

```markdown
# ADR-NNNN: 决策标题

| 字段 | 值 |
|---|---|
| 状态 | 提议 / 采纳 |
| 日期 | YYYY-MM-DD |
| 决策人 | @name |

## 背景
## 决策
## 备选方案
## 影响
## 后续
```

5. **同步更新索引**：在 `docs/decisions/README.md` 的索引表中追加新行。

6. **输出 ADR 摘要并请求 Review**：

```markdown
## ADR-NNNN 已写入

**决策**：[一句话]
**推荐方案**：[方案名]
**文件**：docs/decisions/NNNN-slug.md

**关键影响**：
- [对 SPEC 的改动]
- [对 ARCHITECTURE 的改动]
- [对现有模块的影响]

请 Review ADR，确认或提出修改意见。确认后进入任务拆解（Phase 3）。
```

**卡点规则**：必须等用户确认 ADR 后才进入 Phase 3；用户要求修改时更新 ADR 并重新请求确认。

## Phase 3：任务拆解

**目标**：将 ADR 中的方案拆成可独立交付、有明确验收标准的任务。

**拆解原则：**

- 每个任务 1~2 人日（对 AI 约 1~2 轮对话）可完成
- 任务间有清晰依赖顺序
- 每个任务有明确的输入 / 输出 / 验收标准
- 底层模块先于上层（先 shared Schema → Processor → Controller → UI）
- 测试随功能同步，不单独拆为"补测试"任务
- SDK 变更必须附带体积预算验证（gzip ≤ 15KB）

**步骤：**

1. 读取 `docs/tasks/CURRENT.md`，定位到合适的 Phase / Milestone，取下一个 `T<Phase>.<M>.<Seq>` 编号。

2. 按现有任务格式拆解：

```markdown
- [ ] **TX.Y.Z** {任务标题} — {估时}d
  - 输入：{前置依赖 / 已就绪的模块}
  - 输出：{新增或修改的文件 / 模块}
  - 验收：{可验证的标准}
  - 依赖：{前置任务 ID，无则"无"}
```

3. 将任务写入 `docs/tasks/CURRENT.md` 对应 Milestone 下，并在"当前焦点（Now）"节点更新下一步。

4. **输出任务清单并请求 Review**：

```markdown
## 任务拆解完成

共 N 个任务（TX.Y.Z ~ TX.Y.Z+N），已写入 docs/tasks/CURRENT.md。

[任务列表摘要]

**关键依赖链**：TX.Y.Z → TX.Y.Z+1 → ...
**预估总工时**：N 人日

请 Review 任务拆解，确认或调整后进入实现（Phase 4）。
```

**卡点规则**：必须等用户确认任务拆解后才进入 Phase 4。

## Phase 4：逐任务实现

**目标**：按依赖顺序逐个交付任务。

**每个任务的执行流程：**

1. **切换状态为进行中**：将 `CURRENT.md` 中对应任务从 `[ ]` 改为 `[~]`，并在"当前焦点（Now）"节点更新。

2. **先读后写**：
   - 用 Read/Grep/Glob 工具理解待修改文件的现有实现
   - 识别需遵循的模式（现有 Zod Schema 命名风格、NestJS 模块组织等）

3. **编写代码 + 同步测试**：
   - 遵循 `.claude/rules/coding.md`（TypeScript、Zod、NestJS 约定）
   - 遵循 `.claude/rules/architecture.md`（模块边界、包依赖规则）
   - API 入参出参必须 Zod Schema
   - 异步任务走 BullMQ，队列名在 `packages/shared` 定义
   - 注释使用中文，解释"为什么"

4. **本地验证**：
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```

5. **自检**：逐条对照 `.claude/rules/review.md` 中的 Checklist。

6. **Demo 场景 + 使用文档 + 项目文档传导**（用户可感知的需求必做，纯内部重构可豁免，三步按序执行，详见 `.claude/rules/review.md §9`）：

   **Step 1 · Demo 测试场景（`examples/nextjs-demo/`）**
   - 在对应分组目录（`performance` / `errors` / `api` / `resources` / `tracking` / `custom` 等）新建独立测试场景（页面 / 路由 / 按钮）
   - 场景注释明示触发路径（DevTools 看什么、Dashboard 哪个页面验证）
   - `pnpm dev:demo` 一键可触发

   **Step 2 · 使用说明（`apps/docs/` Rspress 站点）**
   - SDK 能力 → `apps/docs/docs/sdk/<plugin>.mdx`
   - 后端 API → `apps/docs/docs/reference/api.mdx` 或 `reference/<module>.mdx`
   - 后台页面 → `apps/docs/docs/guide/dashboard/<slug>.mdx`
   - 快速接入类 → `apps/docs/docs/quickstart/*.mdx`
   - 内容含：能力简介 + 最小代码/截图 + 配置项 + 常见问题
   - 新增页面同步更新 Rspress 侧边栏（`rspress.config.ts` 或 `_meta.json`）

   **Step 3 · 项目文档传导**（按相关性从上至下）
   - `docs/PRD.md` / `docs/SPEC.md` / `docs/ARCHITECTURE.md` / `docs/DESIGN.md` —— 契约/架构/路由清单级变化
   - `docs/decisions/NNNN-*.md` —— 新增 ADR，「后续」章节引用 demo 路径 + apps/docs 页面
   - `docs/tasks/CURRENT.md` —— 任务 `[~]` → `[x]` + 日期 + 更新 "当前焦点"
   - `GETTING_STARTED.md` —— 本地联调 / SDK 接入涉及时同步
   - `README.md` —— 仅当对外描述改变时更新
   - `CLAUDE.md` / `AGENTS.md` —— 仅当新增了 AI 工具必须遵守的规则时更新

   **双向可追溯**：ADR「后续」章节同时指向 demo 路径 + apps/docs 页面；demo 场景文案反向引用 apps/docs 链接或 ADR 编号

7. **收尾**：将 `CURRENT.md` 中对应任务从 `[~]` 改为 `[x]`，附完成日期；更新"当前焦点（Now）"下一步。

8. **简要报告任务完成情况**，然后继续下一个任务。

**流转规则：**

- 任务按依赖顺序执行；无依赖且作用域不冲突的任务可在同一轮对话中合并执行
- 每个任务完成后立即更新 CURRENT.md 状态
- 遇到阻塞（技术障碍、需求歧义、架构红线冲突）立即暂停并询问用户
- **禁止自动 git commit / push**；由用户人工触发
- 全部任务完成后进入 Phase 5

## Phase 5：交付确认

全部任务完成后输出：

```markdown
## 交付摘要

**需求**：[原始需求]
**ADR**：docs/decisions/NNNN-slug.md
**任务**：TX.Y.Z ~ TX.Y.Z+N（共 N 个，全部完成）

**变更清单**：
- 新增：[文件列表]
- 修改：[文件列表]

**契约影响**：
- SPEC：[是否更新、更新了哪些章节]
- ARCHITECTURE：[是否更新]
- DESIGN：[是否更新]

**Step 1 · Demo 场景**：
- 分组：[performance / errors / api / resources / tracking / custom ...]
- 路径：[examples/nextjs-demo/app/... 新建的页面/组件]
- 触发方式：[pnpm dev:demo 后点击/访问什么能看到效果]

**Step 2 · apps/docs 使用说明**：
- 落点：[apps/docs/docs/sdk/...mdx | reference/...mdx | guide/dashboard/...mdx | quickstart/...mdx]
- 侧边栏：[rspress.config.ts / _meta.json 是否更新]
- 摘要：[一句话说明用户该怎么用]

**Step 3 · 项目文档传导**：
- docs/*.md（PRD/SPEC/ARCHITECTURE/DESIGN）：[章节 + 变更摘要]
- ADR：[编号 + 文件 + 「后续」是否引用 demo 与 apps/docs]
- CURRENT.md：[任务 ID 状态变化]
- GETTING_STARTED / README / CLAUDE / AGENTS：[涉及则列出，否则写 "不涉及"]

**验证状态**：
- typecheck: PASS / FAIL
- lint: PASS / FAIL
- test: PASS / FAIL
- SDK 体积预算（如涉及）：N KB gzip（预算 15KB）

如需提交代码，请手动触发 `git commit`（本 skill 不自动提交）。
```

## 约束

- 遵循 `.claude/rules/` 所有硬性规则（架构红线、代码规范、审查 Checklist）
- ADR 必须使用 `docs/decisions/README.md` 给出的模板
- 任务 ID 必须遵循 `T<Phase>.<Milestone>.<Seq>` 规则，不与已有 ID 冲突
- 不自动执行 `git commit` / `git push` / 分支操作（除非用户明确要求）
- 每个阶段切换前必须有用户确认（Phase 1 无疑问时可合并到 Phase 2 一次确认）
- 需求超出当前 PRD 范围时，先与用户确认是否扩展 PRD，再决定后续动作
