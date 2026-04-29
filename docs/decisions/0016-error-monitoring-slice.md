# ADR-0016: 异常监控闭环切片（SDK ErrorPlugin + 持久化 + Dashboard 只读聚合）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-27 |
| 决策人 | @gaowenbin |

## 背景

性能闭环（ADR-0013 + 0014 + 0015）已打通 SDK → Gateway → `perf_events_raw` → Dashboard API → Web `/performance`。异常监控（PRD §2.2）是 MVP 的另一半核心链路，当前状态：

- SDK 侧无任何错误插件；`captureException` / `captureMessage` 的手动 API 可用，但缺少 `window.onerror` / `unhandledrejection` / 资源 `error` 的自动采集
- server 侧 `error` 事件到 Gateway 后仅打日志（无落库），`apps/web/errors` 仍为 `PlaceholderPage`
- 完整形态（T1.4 ErrorProcessor / T1.5 Sourcemap / T1.6 Issues 列表详情）属于 Phase 1 后半，单口径需要几人周；在此之前需要一个**可见、可演示、可迭代的最小闭环**

与其拆成 3 个 ADR（对偶 0013/0014/0015），本轮合并为 1 个切片 ADR，理由：

- 三件事范围都"只做最小对偶"（非完整 ErrorProcessor / 非 Sourcemap / 非 Issue 状态机），独立成文 ADR 会反复引用同一背景
- 后续完整版（T1.4.1 / T1.5.x / T1.6.x）仍会补独立 ADR，本 ADR 定位为"切片"，不挡路

约束：

- SDK 必须零 Node.js 依赖；体积预算 gzip ≤ 8.5KB（当前 ESM 6.38KB，增量 ≤ 2.1KB）
- 架构红线：Web 不得跨 import server；Gateway 不得绕过持久化 Service 直写 DB；shared 保持无运行时副作用
- 不引入 BullMQ（留给 T1.3.2）；不引入 Sourcemap（留给 T1.5）；不计算指纹（留给 T1.4.2）
- 复用 `ErrorEventSchema`（`packages/shared` 已就绪），不改事件字段

## 决策

### 1. SDK：`errorPlugin()`

新文件 `packages/sdk/src/plugins/error.ts`，工厂返回 `Plugin`。

**订阅源**（全部在 `setup(hub)` 内注册，非浏览器/无 `PerformanceObserver` 环境跳过）：

| 源 | API | `ErrorEvent.subType` |
|---|---|---|
| 全局 JS 异常 | `window.addEventListener("error", handler, false)`（冒泡阶段） | `"js"` |
| 资源 404 / 失败 | `window.addEventListener("error", handler, true)`（捕获阶段，过滤 `event.target` 为 Element 且有 `src`/`href` 的情形） | `"resource"` |
| Promise rejection | `window.addEventListener("unhandledrejection", handler)` | `"promise"` |

**去重**：资源错误捕获阶段与 JS 错误冒泡阶段都会命中同一事件对象；插件内部维护一个 `WeakSet<Event>` 拦截，保证单个 `ErrorEvent` 只上报一次。

**字段映射**（`createBaseEvent(hub, "error")` + 扩展）：

| SDK 侧来源 | `ErrorEvent` 字段 |
|---|---|
| `ErrorEvent.message` / `reason?.message` / `String(reason)` | `message` |
| `ErrorEvent.error?.stack` / `reason?.stack` | `stack` |
| `parseStack(stack)` | `frames`（≤ 20 帧，fileBase + function + line + col，堆栈形如 `at fn (path:line:col)`，正则解析，解析失败返回 `undefined`） |
| resource.target: `tagName` / `src` \|\| `href` / `outerHTML.slice(0,512)` | `resource` |
| 当前 hub breadcrumbs 数组快照 | `breadcrumbs`（MVP 仅附带手动 `addBreadcrumb` 的项；自动采集留 T1.2.3） |

**配置**：

```ts
interface ErrorPluginOptions {
  /** 是否捕获资源错误（默认 true） */
  readonly captureResource?: boolean;
  /** 忽略规则：message 命中即丢弃（沿用 options.ignoreErrors 的语义） */
  readonly ignoreErrors?: ReadonlyArray<string | RegExp>;
}
```

**公开 API**：`packages/sdk/src/index.ts` 追加 `errorPlugin` 具名导出 + UMD 命名空间挂载（与 `performancePlugin` 对齐）。

### 2. 持久化：`error_events_raw` 单表

对偶 `perf_events_raw` 的最简形态，**不做指纹聚合、不做 UPSERT**；每条事件一行，`event_id UNIQUE` 做幂等。

```sql
CREATE TABLE IF NOT EXISTS error_events_raw (
  id               bigserial PRIMARY KEY,
  event_id         uuid NOT NULL UNIQUE,
  project_id       varchar(64) NOT NULL,
  public_key       varchar(64) NOT NULL,
  session_id       varchar(64) NOT NULL,
  ts_ms            bigint NOT NULL,
  sub_type         varchar(16) NOT NULL,          -- js | promise | resource | framework | white_screen
  message          text NOT NULL,                 -- 原始 message（未归一化）
  message_head     varchar(128) NOT NULL,         -- message 前 128 字节，UI 分组键之一
  stack            text,
  frames           jsonb,                          -- StackFrame[]
  component_stack  text,
  resource         jsonb,                          -- { url, tagName, outerHTML? }
  breadcrumbs      jsonb,                          -- Breadcrumb[]（MVP 上限 50）
  url              text NOT NULL,
  path             text NOT NULL,
  ua               text,
  browser          varchar(64),
  os               varchar(64),
  device_type      varchar(16),
  release          varchar(64),
  environment      varchar(32),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_err_project_ts
  ON error_events_raw (project_id, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_err_project_sub_ts
  ON error_events_raw (project_id, sub_type, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_err_project_group_ts
  ON error_events_raw (project_id, sub_type, message_head, ts_ms DESC);
```

**模块边界**：

```
apps/server/src/errors/
├── errors.module.ts
└── errors.service.ts        # saveBatch / countForProject / aggregate*（供 Dashboard 调用）
```

GatewayService `ingest()` 扩展分流：

```ts
const errorEvents = events.filter(e => e.type === "error");
const persistedErrors = errorEvents.length
  ? await this.errors.saveBatch(errorEvents)
  : 0;
```

与 `performance.service.ts` 并列，**保持 Gateway 对两类事件的处理完全对偶**。

### 3. Dashboard API：`GET /dashboard/v1/errors/overview`

```
GET /dashboard/v1/errors/overview
  ?projectId=<string>              必填
  &windowHours=<int>               可选，默认 24，[1, 168]
  &limitGroups=<int>               可选，默认 10，[1, 50]
```

**响应体**（`ErrorOverviewDto`）：

```jsonc
{
  "data": {
    "summary": {
      "totalEvents": 128,
      "impactedSessions": 53,
      "deltaPercent": 12.4,
      "deltaDirection": "up"       // 相对前一窗口
    },
    "bySubType": [
      { "subType": "js",       "count": 87, "ratio": 0.68 },
      { "subType": "promise",  "count": 24, "ratio": 0.19 },
      { "subType": "resource", "count": 17, "ratio": 0.13 },
      { "subType": "framework","count":  0, "ratio": 0 },
      { "subType": "white_screen","count": 0, "ratio": 0 }
    ],
    "trend": [
      { "hour": "2026-04-27T00:00:00.000Z", "total": 12, "js": 10, "promise": 2, "resource": 0 }
    ],
    "topGroups": [
      {
        "subType": "js",
        "messageHead": "Cannot read properties of undefined (reading 'nickname')",
        "count": 54,
        "impactedSessions": 21,
        "firstSeen": "2026-04-27T03:10:12.000Z",
        "lastSeen": "2026-04-27T09:41:32.000Z",
        "sampleUrl": "/profile"
      }
    ]
  }
}
```

**计算规则**：

| 字段 | 来源 | 公式 |
|---|---|---|
| `summary.totalEvents` | `error_events_raw` | `COUNT(*)` |
| `summary.impactedSessions` | 同表 | `COUNT(DISTINCT session_id)` |
| `summary.delta*` | 当前 vs 前一窗口（同 ADR-0015） | `abs(pct) < 0.1%` → `flat` |
| `bySubType[*]` | `GROUP BY sub_type` | 缺失的 enum 值补零占位 |
| `trend[*]` | `date_trunc('hour', to_timestamp(ts_ms/1000.0))` × `sub_type` | 前端按 dayjs 本地化 |
| `topGroups[*]` | `GROUP BY (sub_type, message_head)` 按 count DESC | `firstSeen` / `lastSeen` = min/max ts_ms；`sampleUrl` 取 `MAX(path) FILTER (WHERE ...)`（任意一条路径即可） |

**空数据降级**：`summary.totalEvents = 0` 时 `bySubType` 补齐 5 枚 enum 占位；`trend` / `topGroups` 为空数组。前端渲染"暂无异常"。

**索引命中**：Summary 走 `idx_err_project_ts`；bySubType / trend 走 `idx_err_project_sub_ts`；topGroups 走 `idx_err_project_group_ts`。全部覆盖。

### 4. Web `/errors` 页面

对偶 `/monitor/performance` 的三态（`live | empty | error`）+ 四个组件（ADR-0021 菜单重组后实际路由位于 `(console)/monitor/errors/`）：

```
apps/web/app/(console)/monitor/errors/
├── page.tsx                       # 服务端组件 + force-dynamic
├── summary-cards.tsx              # 总事件数 / 影响会话数 / 环比（复用 Badge variant=tone）
├── sub-type-donut.tsx             # 子类型占比（纯 CSS ring：conic-gradient + flex 图例，不引图表库）
├── trend-chart.tsx                # 复用 @ant-design/plots Line（与 /monitor/performance 同风格）
└── top-groups-table.tsx           # shadcn Table + Badge 高亮 subType
```

`lib/api/errors.ts` 参照 `lib/api/performance.ts` 三态契约；`NEXT_PUBLIC_DEFAULT_PROJECT_ID` 复用（默认 `demo`）。

## 备选方案

**备选 A：本轮直接落 ErrorProcessor + 指纹聚合（合并 T1.4.1 / T1.4.2）。**放弃：指纹算法需要 stack normalize + topFrame 抽取，跟 Sourcemap 还原链路耦合（还原前后指纹不稳定），应在 T1.5 之后做，否则后期需回填指纹。

**备选 B：SDK 用 `window.onerror` 赋值写法。**放弃：会覆盖宿主页面已注册的 `onerror`；`addEventListener` 可与宿主并存，符合 SPEC §3.3.1 "SDK 包裹已有处理器，链式调用不打断用户原处理"。

**备选 C：落 BullMQ 队列 `events-error` 消费。**放弃：与 ADR-0013 的切片路线一致，Gateway 直调 Service 更简单；T1.3.2 统一接入 BullMQ。

**备选 D：Top 列表用完整指纹（`sha1(subType + normalizedMessage + topFrame)`）而非 `message_head`。**放弃：MVP 聚焦可展示性；`message_head` 字面分组足以回答"哪类错误最多"，T1.4.2 落地后迁移键即可（加列不破 API）。

**备选 E：`message_head` 存列并加索引 vs 查询时 `LEFT(message, 128)`。**选前者：索引命中决定性；建表即加列开销极低。

## 影响

**正向：**
- `/errors` 页面从占位升级为真实 live 数据；demo 4 个异常路由（已提交）直接可见可演示
- ErrorPlugin 让 SDK 异常闭环与性能闭环结构对偶，降低新增插件认知成本
- `error_events_raw` + 3 个索引覆盖 Phase 1 Dashboard 全部查询；Processor 落地后平滑切换

**成本：**
- SDK 新增 ~1.3KB gzip（插件 + 堆栈解析；`web-vitals` 之后 ESM 8KB 以内、UMD 7KB 以内）
- server 新增 1 张表 + 1 个模块 + Dashboard 1 个 controller/service
- web 新增 1 个 API 客户端 + 4 个 UI 组件

**风险：**
- `message_head` 分组对 "动态数字/ID" 类错误粒度较粗（如 `Request failed 429 /api/x/123`）；MVP 可接受，T1.4.2 替换为指纹后自动改善
- 堆栈解析器（纯正则）对非 Chromium 浏览器的格式兼容有限；兜底 `frames=undefined` 不影响落库
- 未 normalize 的 `message` 长度不加 text 上限 → 通过 `message_head` 限 128 字节控制索引膨胀，`message` 本体不限制（line 级用 `length` 统计，后续 Processor 可做压缩）

## 后续

- 跟踪 T1.2.2 / T1.4.0（本 ADR 落地的任务主体）+ T1.6.2.0（Dashboard Errors overview 首版）
- 完整 ErrorProcessor + Issues 聚合（T1.4.1 / T1.4.2）落地后，新增 `error_issues` 表 + `idx_err_fingerprint`，本 ADR 的 `topGroups` 改为读 `error_issues`（查询键从 `(sub_type, message_head)` 切到 `fingerprint`，API 兼容）
- Sourcemap 还原（T1.5）落地后，堆栈帧在 Processor 侧还原；SDK `frames` 保持原始值不变
- Breadcrumb 自动采集（T1.2.3）落地后直接生效，无需改 Schema
- T1.3.2 Gateway 接入 BullMQ 时，ErrorsService 从 GatewayService 直调改为 `events-error` Worker 消费
