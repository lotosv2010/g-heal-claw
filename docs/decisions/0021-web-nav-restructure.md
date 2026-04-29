# ADR-0021 Web 后台菜单重构为四级分组结构

- 日期：2026-04-29
- 状态：已接受
- 决策人：Robin
- 关联：
  - ADR-0012 Web 骨架
  - ADR-0020 菜单完整化交付路线图
  - 任务：P0-1 重构 Web 后台菜单为四级分组结构

## 1. 背景

现状：`apps/web` 侧边栏为**扁平 10 项**平铺（overview / performance / logs / errors / visits / api / resources / custom / realtime / projects），菜单元数据集中在 `apps/web/lib/nav.ts`。

问题：

1. **信息密度失衡**：随着埋点、设置相关页面增加（source map、告警、通知渠道、成员、AI 配置、Token、埋点事件/曝光/漏斗/留存），扁平结构将膨胀到 20+ 项，无法维持视觉清晰度。
2. **分类心智缺失**：`projects`（应用管理）与监控数据类页面混在一级，语义错位。
3. **埋点模块缺位**：PRD §2.7 定义的埋点能力（代码/全埋点/曝光/停留）在菜单中无独立容器。
4. **系统设置分散**：未来的 Source Map、告警规则、通知渠道、成员权限、AI 修复配置、API Keys 等配置项无归属。

## 2. 决策

将菜单重构为**一级分组 + 二级叶子**结构，共 4 个分组、18 个叶子；**物理目录、URL、菜单分组三者完全统一**，URL 形如 `/<group>/<child>`：

```
Dashboard            /dashboard/overview, /dashboard/realtime
监控中心             /monitor/errors, /monitor/performance, /monitor/api,
                    /monitor/visits, /monitor/resources, /monitor/logs
埋点分析             /tracking/events, /tracking/exposure, /tracking/funnel,
                    /tracking/retention, /tracking/custom
系统设置             /settings/projects, /settings/sourcemaps, /settings/alerts,
                    /settings/channels, /settings/members, /settings/ai,
                    /settings/tokens
```

### 2.1 分组原则

| 分组 | 职责 | 判定依据 |
|---|---|---|
| **Dashboard** | 跨模块综合视图 | 聚合多数据源，非单一指标 |
| **监控中心** | 前端可观测核心数据 | PRD §2.1–2.5 能力 |
| **埋点分析** | 用户行为数据 | PRD §2.7 + 自定义上报 |
| **系统设置** | 配置类页面 | 非数据分析，修改系统状态 |

### 2.2 路由规则

#### 物理目录（Route Group 外壳 + 真实分组目录）

```
app/
├── layout.tsx
├── page.tsx                ← / （redirect → /monitor/performance）
└── (console)/              ← 唯一 Route Group：管理控制台外壳，共享 layout.tsx
    ├── layout.tsx          （Sidebar + Topbar）
    ├── dashboard/          ← 真实路径段，与 NavGroup.key 同名
    │   ├── overview/       → /dashboard/overview
    │   └── realtime/       → /dashboard/realtime
    ├── monitor/
    │   ├── errors/         → /monitor/errors
    │   ├── performance/    → /monitor/performance
    │   ├── api/            → /monitor/api
    │   ├── visits/         → /monitor/visits
    │   ├── resources/      → /monitor/resources
    │   └── logs/           → /monitor/logs
    ├── tracking/
    │   ├── events/         → /tracking/events
    │   ├── exposure/       → /tracking/exposure
    │   ├── funnel/         → /tracking/funnel
    │   ├── retention/      → /tracking/retention
    │   └── custom/         → /tracking/custom
    └── settings/
        ├── projects/       → /settings/projects
        ├── sourcemaps/     → /settings/sourcemaps
        ├── alerts/         → /settings/alerts
        ├── channels/       → /settings/channels
        ├── members/        → /settings/members
        ├── ai/             → /settings/ai
        └── tokens/         → /settings/tokens
```

#### 命名原则

| 层 | 命名 | 职责 |
|---|---|---|
| 唯一 Route Group | `(console)` | 管理控制台外壳，挂载 Sidebar + Topbar `layout.tsx` |
| 真实分组目录 | `dashboard` / `monitor` / `tracking` / `settings` | URL 前缀 + 与 `lib/nav.ts` 的 `NavGroup.key` 同名 |

**关键约束**：
- Route Group `(console)` **不参与 URL**；URL 从 `dashboard/...` 等分组目录起算
- `slug` 字段统一为 `<group>/<child>` 二段式，**物理路径 = URL = slug**
- `findNav(slug)` / `findNavByPathname(pathname)` / `findGroupKeyByPathname(pathname)` 均可直接取 URL 首段定位分组
- **三合一原则**：物理目录、URL、菜单分组三者完全对齐，无冗余表达

#### 为什么不使用多层 Route Group

曾考虑在 `(console)/` 下按 `NavGroup.key` 引入 `(dashboard)` / `(monitor)` / `(tracking)` / `(settings)` 四个内层 Route Group。**已放弃**，理由：

- Route Group `(xxx)` **不参与 URL**，而用户明确要求 URL 带分组前缀 —— Route Group 无法满足该需求
- 直接使用真实目录，URL、物理路径、菜单分组三者自动对齐，零冗余
- 未来若 `/settings/*` 需要子导航 layout，在 `(console)/settings/layout.tsx` 直接挂载即可

### 2.3 侧边栏交互

- 分组标题可点击折叠；默认展开命中当前 `pathname` 的分组
- 折叠状态写入 `localStorage['ghc:sidebar:expanded-groups']`
- 命中当前分组即便被用户手动收起，也强制展开（确保激活项可见）

### 2.4 迁移约束

- 旧路由 `/projects` → 新路由 `/settings/projects`，通过 `next.config.ts` 的 `redirects()` 配置 **301 永久重定向**
- 已 live 模块路由保持不变（errors / performance / api）
- 短 slug 页面（overview / visits / logs / resources / custom / realtime）路由不变，仅分组归属调整

## 3. 为什么这样选

| 候选 | 选择 | 理由 |
|---|---|---|
| **扁平 10 项保留不动** | ❌ | YAGNI 误用：当前菜单扩展到 18 项后扁平结构不可持续，延后重构成本更高 |
| **分组 + 折叠侧栏** | ✅ | SOLID-S（分组职责明确）、KISS（无需新库）、DRY（复用 PlaceholderPage） |
| 顶部 Tab + 左侧二级 | ❌ | 与现有 Finder 式侧栏美学冲突，引入两套导航心智 |
| 动态菜单配置后台 | ❌ | YAGNI：菜单长期稳定，不需运行时动态化 |

## 4. 实施清单

| 项 | 文件 | 状态 |
|---|---|---|
| 菜单数据结构 | `apps/web/lib/nav.ts`（`NavGroup` / `NavChild` / `findNav` / `findNavByPathname` / `findGroupKey` / `findGroupKeyByPathname`） | ✅ |
| slug 统一为二段式 | 所有叶子 slug 格式 `<group>/<child>`，与 URL 一致 | ✅ |
| 分组折叠侧栏 | `apps/web/components/dashboard/sidebar.tsx`（使用 `findGroupKeyByPathname`） | ✅ |
| Topbar 标题解析 | `apps/web/components/dashboard/topbar.tsx`（`findNavByPathname` 取前两段） | ✅ |
| 外层 Route Group 重命名 | `(dashboard)` → `(console)`，解除"管理控制台"与"菜单分组"的命名冲突 | ✅ |
| 内层 Route Group 不引入 | Route Group 不参与 URL，与"URL 带分组前缀"需求冲突；改用真实分组目录 | ✅ |
| 真实分组目录 | `(console)/{dashboard,monitor,tracking,settings}/`（4 个真实目录） | ✅ |
| 页面按分组迁移 | `overview/realtime → dashboard/`；6 个监控页 → `monitor/`；`custom → tracking/`；保留 `tracking/events` 等 4 页；`settings/*` 7 页 | ✅ |
| 根路径重定向 | `apps/web/app/page.tsx` → `/monitor/performance` | ✅ |
| 301 历史路径重定向 | `apps/web/next.config.ts`：`/overview` `/errors` `/performance` `/api` `/visits` `/resources` `/logs` `/custom` `/realtime` `/projects` 全部 301 → 新分组路径 | ✅ |

## 5. 验收

- [x] `pnpm -F @g-heal-claw/web typecheck` 通过
- [x] `pnpm -F @g-heal-claw/web build` 通过（20 路由）
- [x] 全仓 `pnpm typecheck` 7/7 绿
- [x] 所有旧路径 301 → 新分组路径（如 `/performance` → `/monitor/performance`）
- [x] 侧边栏分组折叠状态刷新后保留

## 6. 影响范围

- **向后兼容**：所有已 live 页面旧 URL 通过 `next.config.ts` 的 `redirects()` 301 兜底
- **后续依赖**：P0-3 埋点系统的 `tracking/events` 页面将在本 ADR 就位的路由上替换 Placeholder
- **文档**：`docs/tasks/CURRENT.md` 的「菜单完整化交付」主题不受影响（`api` / `resources` / `custom` / `logs` 等已 live 目标保持）
