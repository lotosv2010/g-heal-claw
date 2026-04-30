# ADR-0025: apps/server 按入口边界重构（gateway + dashboard 分级 + modules/ 共用业务域）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-30 |
| 决策人 | @Robin |
| 关联 | ADR-0011（server 骨架）/ ADR-0015（dashboard 性能 API）/ ADR-0021（web 4 组菜单）/ ADR-0022（静态资源切片）/ ADR-0023（自定义/日志切片）/ ADR-0024（事件/曝光切片） |

## 背景

`apps/server/src/` 在历经 7 个业务切片（ADR-0013~0024）后，顶层布局出现心智断层：

1. **入口边界不清**：`gateway/`（SDK 写入口）与 `dashboard/`（Web 读入口）职责虽已分离，但 `dashboard/` 内部 **16 个文件全部平铺**（`api.controller.ts` / `api.service.ts` / `errors.controller.ts` / ... / `exposure.controller.ts` / `dashboard.module.ts`），无法一眼看出对应到哪个菜单分组。
2. **目录命名不统一**：`api-monitor/` / `resource-monitor/` 带 `-monitor` 后缀，`errors/` / `tracking/` / `custom/` / `logs/` / `performance/` 无后缀——同属"业务域模块"却命名两极。
3. **前后端心智不对称**：`apps/web` 已按 ADR-0021 四分组菜单（Dashboard / 监控中心 / 埋点分析 / 系统设置）落地路由结构；但 `apps/server/src/dashboard/` 扁平排列 8 组 Controller/Service，开发者读代码时无法快速建立"这段 API 对应前端哪个菜单"的映射。
4. **业务域归属模糊**：`errors/` / `performance/` 等模块同时被 `gateway/`（写路径，Ingest 分发）与 `dashboard/`（读路径，聚合查询）消费，但它们顶层与两个入口同级陈列，暗示"可以当入口来用"——实际上它们是两个入口共用的业务域服务。

随着 Tier 2（visits / realtime / projects）与 Tier 3（overview 收口）还会再叠加 3~6 个模块，现结构若不调整，`dashboard/` 很快膨胀到 30+ 平铺文件，后续回溯成本非线性上升。

## 决策

按**入口边界 + 菜单分组 + 业务域复用**三层组织 `apps/server/src/`：

```
apps/server/src/
├── gateway/              # SDK 写链路唯一入口（保持）
│   ├── gateway.module.ts · gateway.controller.ts · gateway.service.ts
│   ├── dsn-auth.guard.ts · rate-limit.guard.ts · rate-limit.service.ts
│   ├── idempotency.service.ts · project-keys.service.ts · dsn.util.ts
│   └── ingest.dto.ts
│
├── dashboard/            # Web 读链路唯一入口（按 4 组菜单分级）
│   ├── dashboard.module.ts            # 汇总 4 个子菜单的 Controller/Service
│   ├── monitor/                       # 监控中心：errors / performance / api / resources / logs
│   │   ├── errors.controller.ts · errors.service.ts
│   │   ├── performance.controller.ts · performance.service.ts
│   │   ├── api.controller.ts · api.service.ts
│   │   ├── resources.controller.ts · resources.service.ts
│   │   └── logs.controller.ts · logs.service.ts
│   ├── tracking/                      # 埋点分析：events / exposure / custom
│   │   ├── tracking.controller.ts · tracking.service.ts    # 事件分析
│   │   ├── exposure.controller.ts · exposure.service.ts
│   │   └── custom.controller.ts · custom.service.ts
│   ├── settings/                      # 系统设置（本切片仅建占位，Tier 2+ 落地）
│   │   └── .gitkeep
│   └── dto/                           # 跨子菜单复用的 DTO（保留原 dashboard/dto/）
│
├── modules/              # 业务域：gateway 写 + dashboard 读 共用
│   ├── errors/           # 原 src/errors/
│   ├── performance/      # 原 src/performance/
│   ├── api/              # 原 src/api-monitor/（同步重命名 → api）
│   ├── resources/        # 原 src/resource-monitor/（同步重命名 → resources）
│   ├── tracking/         # 原 src/tracking/
│   ├── custom/           # 原 src/custom/
│   └── logs/             # 原 src/logs/
│
├── shared/ · config/ · health/ · dlq/
├── app.module.ts · main.ts
```

**关键原则**：

1. **gateway/ 不动** —— 它已经是 SDK 写链路的唯一入口，内部职责（DSN/限流/幂等/队列写入）清晰。
2. **dashboard/ 子目录与 web `(console)/` 菜单分组 1:1 对齐**：
   - `dashboard/monitor/*` ↔ `/monitor/{errors,performance,api,resources,logs,visits}`
   - `dashboard/tracking/*` ↔ `/tracking/{events,exposure,custom,funnel,retention}`
   - `dashboard/settings/*` ↔ `/settings/*`（Tier 2+ 落地）
   - `dashboard/dashboard/*` 留作 Tier 3 overview 收口目录（本切片不建）
3. **业务域模块统一沉到 `modules/`** —— 通过路径即可区分"入口层（gateway/dashboard）"与"业务域层（modules）"。
4. **命名统一去后缀**：`api-monitor` → `api`、`resource-monitor` → `resources`。**TypeScript 类名同步**：`ApiMonitorModule/Service` → `ApiModule/ApiService`、`ResourceMonitorModule/Service` → `ResourcesModule/ResourcesService`。
5. **零行为变更**：HTTP 路由 / 队列名 / DB 表名 / SDK 契约 **全部保持不变**；仅改目录位置 + TS 符号名 + import 路径。
6. **git mv 保留历史**：所有文件移动通过 `git mv` 执行，保证 `git log --follow` 可回溯。

## 备选方案

### 方案 A（推荐，已采纳）：入口层 + modules/ 业务层 + dashboard/ 按菜单分级

**优点**：
- 入口 vs 业务域在目录层面一目了然，符合 NestJS 社区"by-feature"变体
- `dashboard/` 子目录与 web `(console)/` 菜单完全对称，前后端心智模型统一
- Tier 2+ 后续增加 visits/realtime/projects 模块时，在 `dashboard/monitor/` 或 `dashboard/settings/` 内部追加即可，不会冲撞入口层

**缺点**：
- 一次性改动面较大（~40 文件 `git mv` + ~30 处 import 重写）
- NestJS 类名重命名会造成 `ApiMonitorService` → `ApiService` 的搜索替换（已全局唯一，风险可控）

### 方案 B：仅重构 dashboard 内部（不下沉 modules/）

**做法**：业务模块继续顶层平铺，仅把 `dashboard/*.controller.ts` 按菜单分组下沉到 `dashboard/monitor/ · dashboard/tracking/`。

**优点**：改动面最小（~16 个文件移动）
**缺点**：业务域模块仍与 `gateway/ dashboard/` 入口层混在顶层，入口/业务心智边界不明；`api-monitor/resource-monitor` 命名不一致问题未解决

### 方案 C：按"SDK vs Web"全量二分 `sdk/` + `web/`

**做法**：顶层拆成 `sdk/`（gateway + 所有业务写路径）+ `web/`（dashboard + 所有业务读路径）。

**优点**：入口边界最强
**缺点**：业务域模块（errors/performance 等）同时被两条链路消费，强行二分会**重复代码**或**互相 import 对方目录**，适得其反；与 NestJS DI "共享 provider" 习惯冲突

## 影响

### 收益

- **可读性**：新成员打开 `dashboard/monitor/api.controller.ts`，路径即文档，无需先读 `nav.ts` 再对号入座
- **可扩展性**：Tier 2 的 visits / realtime / projects 自然归位至 `dashboard/monitor/` 或 `dashboard/settings/`
- **命名一致性**：7 个业务域模块全部无 `-monitor` 后缀，`modules/api + modules/resources` 与 `dashboard/monitor/api + dashboard/monitor/resources` 命名对称

### 成本

- **改动量**：~40 文件 `git mv` + ~30 处 import 路径重写 + ~8 处 NestJS 类名搜索替换
- **git blame 影响**：通过 `git mv` 配合 `git log --follow` 可维持，`git blame` 首次点击会显示 rename commit，属可接受
- **冲突窗口**：本切片合并前，任何改 `src/api-monitor/` 或 `src/dashboard/*.ts` 的 PR 会冲突——建议集中 1 天完成且不与其他切片并行

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| 类名 rename 漏改导致 DI 注入失败 | 执行后 `pnpm typecheck` 全绿才提交；Vitest + e2e 全通过 |
| 测试文件路径没同步迁移 | `apps/server/tests/` 目录镜像移动（`tests/api-monitor` → `tests/modules/api` 等） |
| HTTP 路由意外改动 | Controller 装饰器上的 `@Controller('dashboard/v1/...')` 路径字符串**严禁**修改；提交前搜索 diff 确认零 path 变更 |
| 外部导入 `@g-heal-claw/server` 破坏 | 本包无对外公开 export（非 library），仅内部 `main.ts` 启动——无外部影响 |

### 零行为变更承诺

- HTTP 路由清单（`/dashboard/v1/errors|performance|api|resources|tracking|exposure|custom|logs/*` + `/ingest/v1/events` + `/healthz`）**字符完全相同**
- BullMQ 队列名、DB 表名、Drizzle Schema **不改**
- SDK ↔ Gateway 契约 **不变**
- `apps/web/lib/api/*` fetch URL **不变**

## 后续

### Demo / 使用文档

- **Demo 场景（`examples/nextjs-demo/`）**：纯内部重构，无用户可感知行为变化，**按 `.claude/rules/review.md §9`豁免** Step 1/Step 2，仅做 Step 3 项目文档传导
- **使用文档（`apps/docs/`）**：无需更新（路由/契约/菜单结构不变）

### 项目文档传导

- `docs/ARCHITECTURE.md §3.1` 模块拓扑：已更新目录树 + 补充 "入口层 / 业务域层" 分层说明（2026-04-30）；`ApiMonitorModule/Service` → `ApiModule/Service`，`ResourceMonitorModule/Service` → `ResourcesModule/Service`
- `docs/decisions/README.md` 索引：追加 ADR-0025 行
- `docs/tasks/CURRENT.md`：TM.R.1 / TM.R.2 / TM.R.3 / TM.R.4 全部 `[x]` 于 2026-04-30；更新"当前焦点"
- ADR-0022 / ADR-0023 / `decisions/README.md`：保留旧命名的历史记录语境（不追溯改写既成 ADR 正文）
- 其他文档（PRD / SPEC / DESIGN / CLAUDE / AGENTS / README / GETTING_STARTED）**不涉及**

### 实施结果（2026-04-30）

- TM.R.1：业务域模块下沉 `modules/` — 8 个业务模块迁入 `modules/*/`，23 测试文件镜像迁移，typecheck/build/test 全绿
- TM.R.2：同切片更名 — `api-monitor/` → `modules/api/`（Service/Module 同步改名）、`resource-monitor/` → `modules/resources/`；14 文件触达
- TM.R.3：`dashboard/` 按 4 组菜单分级 — `dashboard/monitor/`（10 文件）+ `dashboard/tracking/`（6 文件）+ `dashboard/settings/.gitkeep`；`dashboard.module.ts` import 路径同步、controllers/providers 列表字符串不变
- 零行为变更验证：HTTP 路由清单 / 队列名 / DB 表名 / SDK 契约 / web fetch URL 字符完全不变；baseline 23 files / 209 tests + 1 e2e / 6 tests 全绿

### 后续切片可受益

- **Tier 2 visits 切片**：新增文件直接落 `dashboard/monitor/visits.{controller,service}.ts` + `modules/visits/`
- **Tier 2 projects/settings 切片**：`dashboard/settings/projects.{controller,service}.ts`
- **Tier 3 overview 切片**：新建 `dashboard/dashboard/overview.{controller,service}.ts`
