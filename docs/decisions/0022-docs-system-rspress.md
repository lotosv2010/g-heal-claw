# ADR-0022 文档系统选型与初始化（Rspress）

- 日期：2026-04-29
- 状态：已接受
- 决策人：Robin
- 关联：
  - ADR-0020 菜单完整化交付路线图
  - 任务：P0-2 初始化文档系统

## 1. 背景

现状：项目文档分散在 `docs/*.md`（PRD / ARCHITECTURE / DESIGN / SPEC / ADR / tasks）与 `README.md` / `GETTING_STARTED.md`，仅在 Git 仓库中以 Markdown 形式存在，**无统一站点**。

随着 SDK、Server、Web、AI Agent 多模块成熟，以下诉求开始出现：

1. **对外发布**：SDK 接入指南、API 契约、Dashboard 使用手册需要可托管、可搜索的站点
2. **版本化**：不同 SDK 版本、Server API 版本需独立文档版本线
3. **多语言潜力**：预留中英双语空间（MVP 仅中文）
4. **体验一致性**：与现有 Next.js Dashboard 的 React + MDX 技术栈对齐，降低二次开发摩擦
5. **低运维**：CI 构建后静态产物部署到 GitHub Pages / Vercel / 内网任何静态服务

## 2. 决策

选用 **Rspress** 作为文档站点引擎，在 `apps/docs/` 初始化。

### 2.1 候选对比

| 候选 | 选择 | 理由 |
|---|---|---|
| **Rspress**（Rsbuild + MDX + React） | ✅ | 与 Next.js Dashboard React 技术栈一致；原生 MDX；Rsbuild 构建速度快；字节内部 + 社区活跃；零配置内置搜索、暗色主题、国际化 |
| VitePress | ❌ | Vue 生态；与 React Dashboard 割裂；MDX 支持非原生 |
| Docusaurus | ❌ | 功能强但 webpack + React 18 + 配置复杂；启动/构建慢；对 MVP 过度 |
| Nextra | ❌ | 与 Next.js 耦合较深，会与 `apps/web` 混淆；需额外 Next 服务端；与 Rspress 优势重叠但生态更新较慢 |
| 继续用 Markdown（零站点） | ❌ | 无法满足对外发布、搜索、版本化诉求 |

### 2.2 文档边界（关键）

项目存在**两套**文档，严格分离：

| 文档 | 位置 | 读者 | 内容 |
|---|---|---|---|
| **工程上下文** | `docs/*.md`（PRD / ARCHITECTURE / DESIGN / SPEC / ADR / tasks） | **AI 编程工具 + 工程师** | 需求、架构、契约、任务跟踪、决策记录 |
| **用户操作手册** | `apps/docs/`（Rspress 站点，类似 Ant Design 文档风格） | **平台最终用户** | 如何接入 SDK、如何使用 Dashboard、FAQ |

本站**不复制**工程文档内容，两者永不重叠。

### 2.3 目录结构（2026-04-29 重构）

顶导 4 项：**快速开始 / 入门指南 / 接口说明 / SDK 说明**。将原 Dashboard 分组合并入入门指南，新增 **接口说明** 作为指标字典权威入口（含 MDN Navigation Timing 时序图）。

```
apps/docs/
├── package.json
├── tsconfig.json
├── rspress.config.ts
├── docs/
│   ├── public/logo.svg
│   ├── styles/override.css           ← 首页特性卡一行 4 列
│   ├── index.md                      ← Hero + 4 张特性卡（对应 4 个顶导）
│   ├── quickstart/                   ← 快速开始
│   │   ├── index.md                  ← 5 分钟上手
│   │   └── create-project.md
│   ├── guide/                        ← 入门指南（产品介绍 + 六大模块使用）
│   │   ├── introduction.md
│   │   ├── dashboard-overview.md
│   │   ├── errors.md
│   │   ├── performance.md
│   │   ├── api.md
│   │   ├── visits.md
│   │   ├── tracking.md
│   │   └── settings.md
│   ├── reference/                    ← 接口说明（指标字典）
│   │   ├── index.md
│   │   ├── performance-metrics.md    ← LCP/INP/CLS/FCP/TTFB/FMP/Long Task
│   │   ├── navigation-timing.md      ← 瀑布图 12 节点 + MDN 时序图
│   │   ├── error-metrics.md          ← Issue/Event/指纹/HLL/告警触发条件
│   │   └── api-metrics.md            ← Summary/Status 桶/TTFB 构成/错误分类
│   └── sdk/
│       ├── installation.md
│       ├── error.md
│       ├── performance.md
│       ├── api.md
│       ├── tracking.md
│       └── sourcemap.md
└── README.md
```

### 2.3.1 指标字典设计原则

- **权威单源**：`reference/` 是所有指标名词的唯一定义处；`guide/` 只讲"怎么用"，指标名链接到 `reference/` 对应锚点
- **对齐官方**：Core Web Vitals 口径对齐 web.dev；Navigation Timing 对齐 W3C Level 2；Resource Timing 对齐 W3C L2
- **示意图外链**：MDN `timestamp-diagram.svg` 由 Rspress 直接远程加载，避免静态资产同步负担
- **字段覆盖**：Dashboard 上出现的每一列 / 每一张卡片都在 `reference/` 有对应条目

### 2.4 关键约定

| 约束 | 规则 |
|---|---|
| 技术栈一致性 | Rspress（Rsbuild + React 19 + MDX），参考 Ant Design 文档体验 |
| 文档边界 | 严格与 `docs/*.md`（AI / 工程上下文）分离，**零重叠**；面向最终用户 |
| 包命名 | `@g-heal-claw/docs`（private） |
| 构建产物 | `apps/docs/doc_build/`（Rspress 默认） |
| 端口 | dev: `4000`（避让 server 3000 / web 3100 / demo 3200） |
| 脚本 | `dev` / `build` / `preview` — 对齐 Turborepo `build` task |
| 搜索 | 内置本地搜索（MVP），后续可切 Algolia |
| 部署 | MVP 仅本地 dev + `pnpm -F @g-heal-claw/docs build` 产出静态站点；CI 部署延后 |

### 2.5 Turbo 集成

- `turbo.json` 无需修改；`build` / `dev` / `typecheck` 任务自动覆盖
- Rspress dev 使用 `"persistent": true`，与 `apps/web` `apps/server` 一致

## 3. 实施清单

| 项 | 文件 | 状态 |
|---|---|---|
| ADR 记录 | `docs/decisions/0022-docs-system-rspress.md` | ✅ |
| 包脚手架 | `apps/docs/package.json` / `tsconfig.json` / `.gitignore` | ✅ |
| Rspress 配置 | `apps/docs/rspress.config.ts`（四组导航：指南 / Dashboard / SDK / FAQ） | ✅ |
| 首页 | `apps/docs/docs/index.md`（Hero + 四张特性卡） | ✅ |
| 指南 | `apps/docs/docs/guide/{introduction,getting-started,create-project}.md` | ✅ |
| Dashboard 手册 | `apps/docs/docs/dashboard/{overview,errors,performance,api,visits,tracking,settings}.md` | ✅ |
| SDK 手册 | `apps/docs/docs/sdk/{installation,error,performance,api,tracking,sourcemap}.md` | ✅ |
| FAQ | `apps/docs/docs/faq/index.md` | ✅ |
| Logo | `apps/docs/docs/public/logo.svg` | ✅ |
| README | `apps/docs/README.md`（本地开发 + 约定） | ✅ |
| 依赖安装 | `pnpm install` 成功 | ✅ |
| 构建验证 | `pnpm -F @g-heal-claw/docs build` 成功（190KB gzip） | ✅ |

## 4. 验收

- [x] `pnpm -F @g-heal-claw/docs build` 产出静态站点（doc_build/，190KB gzip）
- [x] SSR 17 个页面全部渲染成功
- [ ] `pnpm -F @g-heal-claw/docs dev` 本地起站（:4000） — 交给人工验证

## 5. 影响范围

- **新增应用**：`apps/docs/`（私有包，不发布 npm）
- **现有文档**：`docs/*.md` 仍保持工程上下文源真值，**不删除**、**不搬迁**
- **边界守则**：
  - `docs/` 任何调整**不联动** `apps/docs/`（反之亦然）
  - `apps/docs/` 永远站在"用户侧"描述产品行为，禁止出现内部模块名、数据库表、队列名等实现细节
- **后续任务**：
  - P0-3 埋点系统完成后在 `apps/docs/docs/sdk/tracking.md` 解除"建设中"标记
  - Dashboard 功能页每次新增能力，同步更新 `apps/docs/docs/dashboard/*`
