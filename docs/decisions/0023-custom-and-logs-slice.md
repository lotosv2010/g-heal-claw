# ADR-0023: 自定义上报 + 日志查询切片（TM.1.C）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-29 |
| 决策人 | @Robin |
| 关联 | ADR-0020（菜单完整化路线图） · ADR-0022（静态资源监控切片，同构复用装配层模式） · SPEC §3.3.6 自定义上报契约 |

## 背景

Tier 1 菜单完整化剩余两张 PlaceholderPage：

- `/tracking/custom` — 自定义上报（业务埋点 + 业务测速）
- `/monitor/logs` — 日志查询

`packages/shared/src/events/{custom-event,custom-metric,custom-log}.ts` 三张 Schema 已就位（SPEC §3.3.6），但：

- SDK 侧 `GHealClaw.track / time / log / captureMessage` 仅有零散占位，未统一成插件
- 后端 Gateway 未分流 `type in {custom_event, custom_metric, custom_log}`
- 无 `*_raw` 表、无 Module、无 Dashboard 聚合接口
- 两张菜单页仍是 PlaceholderPage

另一个关键约束：已存在 `trackPlugin`（P0-3，`type='track'`，覆盖 click/submit/expose/code 4 类**被动 DOM 采集**），与本次 `track/time/log` **主动业务 API** 在 `type` 上完全独立，UI 与聚合口径也不重叠。

## 决策

新增 **TM.1.C Custom + Logs 合并切片**，端到端交付 SDK `customPlugin` + 3 张独立 raw 表 + `CustomModule` / `LogsModule` + `/tracking/custom` 与 `/monitor/logs` 两张大盘 + Demo + 文档。

### 1. 菜单 ↔ 数据归属

| 菜单 | 覆盖事件 type | 视角 |
|---|---|---|
| `/tracking/custom` | `custom_event` + `custom_metric` | 业务埋点（事件名 / 属性） + 业务测速（分位数） |
| `/monitor/logs` | `custom_log` | 运维/排障（按 level 分桶 + 趋势 + Top message） |

底层数据 / SDK API 合并实现一次，前端按菜单分别呈现。

### 2. SDK `customPlugin`（主动业务 API）

统一导出：

```ts
// packages/sdk/src/client.ts
interface Client {
  track(name: string, properties?: Record<string, unknown>): void;
  time(name: string, durationMs: number, properties?: Record<string, unknown>): void;
  log(level: "info" | "warn" | "error", message: string, data?: unknown): void;
  captureMessage(message: string, level?: "info" | "warning" | "error"): string;  // 兼容 SPEC §3.3.1，内部转 log
}
```

**关键设计**：

- **无 DOM 监听**：customPlugin 纯粹是主动 API 封装层，不挂任何 window 事件（与 trackPlugin 被动监听彻底分离）
- **幂等 setup**：在 init 时注册到 `hub.client.track/time/log`，重复 setup 返回 noop
- **类型分发**：3 个 API 分别产出 `custom_event / custom_metric / custom_log` 事件，Schema 已定，直接走 Hub transport 批量上报
- **SSR 降级**：非浏览器环境 API 返回 undefined 不抛错；`captureMessage` 返回空串
- **尺寸限制**（防日志风暴）：
  - `log.data` 序列化后超过 8KB → 截断，追加 `__truncated: true`
  - 单会话 `custom_log` 限额 200 条（与 breadcrumb 限额同理）
  - `custom_metric.duration` 非负数；超 24h 的数值视为误用，静默丢弃
- **命名空间**：UMD 构建自动挂 `window.GHealClaw.{track,time,log,captureMessage}`

### 3. 三张独立 raw 表（与已有 api/resource/track 同构）

延续 ADR-0020 §4.2 与 ADR-0022 分表思路，**不合表**：

```sql
-- custom_events_raw
CREATE TABLE custom_events_raw (
  id              bigserial PRIMARY KEY,
  event_id        uuid NOT NULL UNIQUE,
  project_id      varchar(64) NOT NULL,
  public_key      varchar(64) NOT NULL,
  session_id      varchar(64) NOT NULL,
  ts_ms           bigint NOT NULL,
  name            varchar(128) NOT NULL,
  properties      jsonb NOT NULL DEFAULT '{}'::jsonb,
  page_url        text NOT NULL,
  page_path       text NOT NULL,
  ua              text,
  browser         varchar(64),
  os              varchar(64),
  device_type     varchar(16),
  release         varchar(64),
  environment     varchar(32),
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- 索引：(project_id, ts_ms DESC) · (project_id, name, ts_ms DESC)

-- custom_metrics_raw
CREATE TABLE custom_metrics_raw (
  ... 同上基础列,
  name            varchar(128) NOT NULL,
  duration_ms     double precision NOT NULL,
  properties      jsonb NOT NULL DEFAULT '{}'::jsonb
);
-- 索引：(project_id, ts_ms DESC) · (project_id, name, ts_ms DESC)

-- custom_logs_raw
CREATE TABLE custom_logs_raw (
  ... 同上基础列,
  level           varchar(8) NOT NULL,   -- info | warn | error
  message         text NOT NULL,
  message_head    varchar(128) NOT NULL, -- 前 128 字，聚合用
  data            jsonb,                 -- 可选
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- 索引：(project_id, ts_ms DESC) · (project_id, level, ts_ms DESC) · (project_id, level, message_head, ts_ms DESC)
```

**为何分表而非合表**：
- 与 `api_events_raw / resource_events_raw / track_events_raw` 架构同构，装配层模板可直接复用
- 聚合 SQL 不需要按 type 过滤（特定于表），分位数 / level 分桶的索引开销更低
- 列稀疏度低：metric 有 `duration_ms`，log 有 `level / message / data`，合表会有大量 null
- 代价：3 个 Service + 3 套 saveBatch；已在 ApiMonitorService / ResourceMonitorService 验证过这套模板，代码量可控

### 4. 后端 `CustomModule` + `LogsModule`

**两个独立 Module**（与前端菜单 1:1 对应），便于后续 CustomModule 扩展事件 / metric 专属能力（如 funnel / 分位数时序）：

```
apps/server/src/custom/
├── custom.module.ts
├── custom-events.service.ts       // saveBatch + aggregateSummary/typeBuckets/trend/topEvents/topPages
└── custom-metrics.service.ts      // saveBatch + aggregateSummary/topMetrics(按 name 取 p50/p75/p95/count)/trend

apps/server/src/logs/
├── logs.module.ts
└── logs.service.ts                // saveBatch + aggregateSummary/levelBuckets/trend/topMessages/search
```

**GatewayService.分流**：新增 3 条分流

```ts
if (event.type === "custom_event") customEventsService.saveBatch(...)
if (event.type === "custom_metric") customMetricsService.saveBatch(...)
if (event.type === "custom_log") logsService.saveBatch(...)
```

保持过渡期 Gateway 直调，BullMQ `events-custom` 队列保留但不启用（与 resource / track 同模式）。

**CustomEventsService 聚合**：
- `aggregateSummary(window)` — `totalEvents / distinctNames / topEventName / avgPerSession`
- `aggregateTopEvents(window, limit)` — 按 name 分组计数倒序
- `aggregateTrend(window)` — 按小时 count
- `aggregateTopPages(window, limit)` — 按 page_path 分组计数倒序

**CustomMetricsService 聚合**：
- `aggregateSummary(window)` — `totalSamples / distinctNames / globalP75 / globalP95`
- `aggregateTopMetrics(window, limit)` — 按 name 分组，每组 `(count, p50, p75, p95, avgDurationMs)`，按 p75 倒序
- `aggregateTrend(window)` — 按小时 count + avgDurationMs

**LogsService 聚合**：
- `aggregateSummary(window)` — `totalLogs / errorCount / warnCount / infoCount + 双窗口 errorRatio delta`
- `aggregateLevelBuckets(window)` — 3 类固定占位（info/warn/error）
- `aggregateTrend(window)` — 按小时 (info, warn, error) 三曲线
- `aggregateTopMessages(window, limit)` — 按 `(level, message_head)` 分组计数倒序
- `search(query, limit)` — 保留骨架接口（level 筛选 + 时间窗口 + message LIKE），首版 UI 不强依赖

### 5. Dashboard API

```
GET /dashboard/v1/custom/overview?projectId=...&windowHours=24&limit=10
GET /dashboard/v1/logs/overview?projectId=...&windowHours=24&limit=10
```

两个装配层 Service + Controller：
- `DashboardCustomService` 并行拉取 events/metrics 两侧聚合，合成 `{ events: {...}, metrics: {...} }`
- `DashboardLogsService` 独立，含双窗口 errorRatio 绝对百分点 delta（沿用 resources.service round4 模式）

响应结构严格对偶 `/resources/overview`：
```ts
{
  data: {
    summary: { ...metric, delta?: {...} },
    ...buckets / trend / top*,
  },
  source: "live" | "empty" | "error",
}
```

### 6. Web 页面

```
app/(console)/tracking/custom/
├── page.tsx                  // force-dynamic + SourceBadge
├── summary-cards.tsx         // 事件：总事件/不同事件名/Top 事件/人均事件；Metric：总样本/不同 metric/全站 p75/p95
├── events-trend-chart.tsx    // AntV Line 单折线（count by hour）+ Metric 切换
├── top-events-table.tsx      // 事件 Top：name / count / lastSeen
└── top-metrics-table.tsx     // Metric Top：name / count / p50 / p75 / p95

app/(console)/monitor/logs/
├── page.tsx
├── summary-cards.tsx         // 总日志 / 错误日志（red delta） / 警告日志 / 错误率（pp delta）
├── level-buckets.tsx         // 3 类固定占位 info/warn/error
├── trend-chart.tsx           // AntV Line 三折线（info/warn/error）
└── top-messages-table.tsx    // level(Badge) / message_head / count / lastSeen
```

### 7. Demo 场景

```
examples/nextjs-demo/app/(demo)/custom/
├── track/page.tsx            // 按钮触发 GHealClaw.track('cart_add', { sku, price })
├── time/page.tsx             // setTimeout 模拟耗时 + GHealClaw.time('checkout_time', ms)
└── log/page.tsx              // 三个按钮触发 info/warn/error 日志
```

`demo-scenarios.ts` 新增两个分组或在既有 `tracking` + 新增 `logs` 分组登记。

### 8. 文档落点

- `GETTING_STARTED.md §7.5` 自定义上报接入示例（3 API）
- `apps/docs/docs/sdk/custom.md`（新）SDK 端 3 API 详解 + 与 trackPlugin 区别
- `apps/docs/docs/guide/custom.md`（新）自定义大盘使用说明
- `apps/docs/docs/guide/logs.md`（新）日志查询使用说明
- Rspress sidebar `/sdk/` + `/guide/` 双处注册
- ADR-0023「后续」章节引用所有路径
- `docs/ARCHITECTURE.md §3.1` 新增 `CustomModule` + `LogsModule`；§5.1 路由 ✅；§8.1.1 事件流表 6 → 9 张

## 备选方案

### A. 合表方案：一张 `custom_events_raw` 用 `type` 列区分（否决）

- 优点：单表、单 Service、聚合 SQL 统一
- 缺点：
  - 列稀疏度高（metric 独有 `duration_ms`，log 独有 `level/message/data`）
  - `type` 过滤走索引成本比直接独立表高
  - 与既有 `api_events_raw / resource_events_raw / track_events_raw` 架构不一致
  - 前端大盘两条视角（埋点 vs 日志）仍需走不同 SQL 模板，合表无实际 UI 复用收益
- **拒绝**。

### B. 扩展 trackPlugin 一起采主动 API（否决）

- trackPlugin 职责是"被动 DOM 埋点"，主动 API 混入会破坏单一职责
- 两者 `type` 不同（track vs custom_event），分开更清晰
- **拒绝**。

### C. 首版 logs 做检索而非聚合（否决）

- 检索界面开发成本大（分页 / 过滤器 / 虚拟滚动 / 实时流）
- 首版"健康度"视角用大盘更合适；检索接口先留骨架 Phase 3 强化
- **拒绝**。

### D. 采纳：3 张独立 raw 表 + 两独立 Module + 首版聚合大盘（✅）

- 架构同构；模板可复用；扩展路径清晰
- 代价：3 个 Service（已验证模板可控）

## 影响

### SPEC
- §3.3.6 自定义上报章节保持（已在），新增一段 SDK `captureMessage` 与 `log` 关系说明
- §5.4 Dashboard API 追加 `/dashboard/v1/custom/overview` + `/dashboard/v1/logs/overview` 契约段

### ARCHITECTURE
- §3.1 模块列表新增 `CustomModule` + `LogsModule` 两行
- §5.1 路由清单 `/tracking/custom` + `/monitor/logs` 置 ✅
- §8.1.1 事件流表 6 张 → 9 张，追加 `custom_events_raw / custom_metrics_raw / custom_logs_raw`
- BullMQ `events-custom` 清单保持"过渡期：Gateway 直调"

### 契约变更
- `CustomEventSchema / CustomMetricSchema / CustomLogSchema` 字段保持（已在 shared），仅补 `properties` 默认值与大小限制
- Dashboard 新增 2 个 GET 端点

### 依赖
- 零新增外部依赖
- 遵循 .claude/rules/architecture.md：SDK 浏览器兼容、禁止绕过 GatewayModule
- 测试放置在 `tests/` 目录（ADR-0019）

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| `custom_log.data` 超大拖慢 ingest | 8KB 截断 + 单会话 200 条限额 |
| `custom_metric` 被误用（duration=NaN/Infinity） | Schema `z.number().nonnegative().finite()` + 24h 上限过滤 |
| 合并切片导致 PR 过大 | 任务粒度按 6 枚拆（SDK / shared / raw 表 / 后端模块 / dashboard API / web + demo + 文档） |
| SDK 体积膨胀 | customPlugin 纯 API 封装（无 DOM 监听），预估 +~0.5KB gzip |

## 后续

- **任务拆解 `docs/tasks/CURRENT.md` TM.1.C.1 ~ TM.1.C.6 全部完成（2026-04-29）**
- **Demo 已落点**（✅ 已交付）：
  - `examples/nextjs-demo/app/(demo)/custom/track/page.tsx` — 4 类 `custom_event`（cart_add / checkout_success / banner_click / share_click）
  - `examples/nextjs-demo/app/(demo)/custom/time/page.tsx` — 2 类 `custom_metric`（checkout_duration 200~600ms / editor_cold_start 500~2000ms）+ 手填 + 离群值
  - `examples/nextjs-demo/app/(demo)/custom/log/page.tsx` — info / warn / error + 大 payload 截断演示
  - `examples/nextjs-demo/app/ghc-provider.tsx` 注册 `customPlugin()`
  - `examples/nextjs-demo/app/demo-scenarios.ts` 新增 `custom` 分组（accent rose，3 条）
- **文档已落点**（✅ 已交付）：
  - `GETTING_STARTED.md §7.5 自定义上报（customPlugin · ADR-0023）`
  - `apps/docs/docs/sdk/custom.md` — SDK 详解 + 与 trackPlugin 对照 + 数据流 + 联调
  - `apps/docs/docs/guide/custom.md` — `/tracking/custom` 大盘使用说明
  - `apps/docs/docs/guide/logs.md` — `/monitor/logs` 大盘使用说明
  - `apps/docs/rspress.config.ts` sidebar `/sdk/` + `/guide/` 双处注册（3 条新增）
  - `docs/ARCHITECTURE.md §3.1`（CustomModule + LogsModule 2 行）/ §5.1（`/tracking/custom` + `/monitor/logs` ✅ 标记）/ §8.1.1（事件流表 6 → 9 张）/ BullMQ（events-custom + events-log 状态→🟡 过渡期）
- **双向可追溯**：本 ADR 引用 demo + 文档路径；demo 页面 JSDoc 引用 ADR-0023 并指向大盘 URL；文档页面引用 ADR / sdk 页面交叉链接

## 验收

- `pnpm typecheck` 8/8 全绿；`pnpm build` 全绿
- SDK 单测：track/time/log 幂等 + SSR 降级 + 大小截断 + 24h 上限过滤
- Server 单测：3 个 saveBatch 幂等 + 各聚合方法（双窗口 delta / level 桶 / p50p75p95 Top）
- Web `/tracking/custom` + `/monitor/logs` 三态 Badge（live / empty / error）
- Demo 3 页可触发 custom_event / custom_metric / custom_log 入库并在大盘可见
- 菜单 nav.ts `tracking/custom` + `monitor/logs` placeholder 置 `null`
