# ADR-0022: 静态资源监控切片（TM.1.B）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-29 |
| 决策人 | @Robin |
| 关联 | ADR-0020（菜单完整化路线图）· ADR-0016（异常监控切片）· ADR-0020 §4.1 apiPlugin 与 httpPlugin 并存模型 |

## 背景

`/monitor/resources` 菜单当前仍为 PlaceholderPage。PRD §2.5 要求：

- 资源加载测速（`PerformanceResourceTiming`）
- 失败率 / 慢资源 Top
- 按类型（script / stylesheet / image / font / media）拆分
- 按 host / CDN 维度聚合

ADR-0020 §4 已定义 Tier 1.B 切片范围（`resource_events_raw` + `resourcePlugin` + 聚合大盘 ~3d）。

现有资产：
- `packages/shared/src/events/resource.ts` 已定义 `ResourceEventSchema`（`initiatorType / url / duration / transferSize` 等）
- `packages/sdk/src/plugins/error.ts` 已捕获 `<script> / <link> / <img>` 等 **加载失败** 的 DOM 事件（type='error', category='js_load/image_load/…'）
- `packages/sdk/src/plugins/api.ts` 已采集所有 fetch/XHR 明细（type='api'）

**核心问题**：如何区分"资源监控"与已有的"异常监控资源加载失败 / API 监控"，避免数据双采、定位错乱？

## 决策

新增 **TM.1.B 资源监控切片**，端到端交付 SDK `resourcePlugin` + `resource_events_raw` + `ResourceMonitorModule` + `/monitor/resources` 大盘 + Demo + 文档。

### 1. SDK `resourcePlugin`（与 errorPlugin / apiPlugin 并存的第三条数据链路）

**职责边界**：

| 插件 | 关注 | 数据源 | 事件 type |
|---|---|---|---|
| `errorPlugin` | 加载 **失败** 的静态资源（`<script>/<img>/<link>` error 事件） | DOM `error` 事件 | `error`（`category=js_load/image_load/css_load/media_load`） |
| `apiPlugin` | fetch / XHR 请求明细（含成功） | fetch & XMLHttpRequest patch | `api` |
| **`resourcePlugin`（新）** | 所有静态资源的 **加载性能** 全量样本 | `PerformanceObserver('resource')` | `resource` |

**关键设计**：

- **初始化源**：仅 `PerformanceObserver` 订阅 `resource` entry；**不采集** DOM `error` 事件（errorPlugin 已负责）。
- **6 类分类**：
  - `script`（`initiatorType: script`）
  - `stylesheet`（`initiatorType: link/css`，过滤 `rel=stylesheet`）
  - `image`（`initiatorType: img/imageset`）
  - `font`（`initiatorType: css` 且 url 匹配 `.woff|.ttf|.otf|.eot`，或 `initiatorType: font`）
  - `media`（`initiatorType: audio/video`）
  - `other`（兜底）
  - **明确排除** `initiatorType in {fetch, xmlhttprequest, beacon}`：避免与 apiPlugin 重复采样
- **`failed` 判定**（仅 PerformanceResourceTiming 层面，与 errorPlugin 形成 XOR 覆盖）：
  ```
  failed = (transferSize === 0 && decodedSize === 0 && responseStart === 0)
        OR duration === 0（某些浏览器对 4xx/5xx 将 duration 置零）
  ```
  备注：DOM `error` 事件（404）由 errorPlugin 捕获，两条链路可通过 `host + url` 关联分析
- **`slow` 判定**：本期统一 `duration > slowThresholdMs`（默认 1000ms），后续按类型细化
- **`host` 派生**：从 `name` URL parse 出 `host`（便于 CDN 分析）
- **批量上报**：默认采用 Hub transport 的既有批量通道，避免首屏瀑布爆量
- **SSR / 浏览器不支持 PerformanceObserver** → 静默跳过
- **幂等 setup**：重复 setup 返回 noop（与其他插件一致）

**复用现有 Schema**：

`ResourceEventSchema` 扩展（向后兼容，新增字段均 optional）：
```ts
{
  type: "resource",
  initiatorType: string,         // 原始 RT 类型
  category: "script" | "stylesheet" | "image" | "font" | "media" | "other",  // 新增
  host: string,                  // 新增（URL.host 派生）
  url: string,
  duration: number,
  transferSize?: number,
  encodedSize?: number,
  decodedSize?: number,
  protocol?: string,
  cache: "hit" | "miss" | "unknown",  // 既有
  slow: boolean,                 // 新增（默认 false）
  failed: boolean,               // 新增（默认 false）
  startTime?: number,            // 新增（PerformanceEntry.startTime，供相对时序调试）
}
```

### 2. 后端 `resource_events_raw` 表

与已有 `api_events_raw / track_events_raw` 字段风格对齐：

```sql
CREATE TABLE resource_events_raw (
  id                bigserial PRIMARY KEY,
  event_id          uuid NOT NULL UNIQUE,
  project_id        varchar(64) NOT NULL,
  public_key        varchar(64) NOT NULL,
  session_id        varchar(64) NOT NULL,
  ts_ms             bigint NOT NULL,
  category          varchar(16) NOT NULL,     -- script / stylesheet / image / font / media / other
  initiator_type    varchar(32) NOT NULL,     -- 原始 RT initiatorType
  host              varchar(128) NOT NULL,
  url               text NOT NULL,
  duration_ms       double precision NOT NULL,
  transfer_size     integer,
  encoded_size      integer,
  decoded_size      integer,
  protocol          varchar(32),
  cache             varchar(16) NOT NULL DEFAULT 'unknown',  -- hit/miss/unknown
  slow              boolean NOT NULL DEFAULT false,
  failed            boolean NOT NULL DEFAULT false,
  page_url          text NOT NULL,
  page_path         text NOT NULL,
  ua                text,
  browser           varchar(64),
  os                varchar(64),
  device_type       varchar(16),
  release           varchar(64),
  environment       varchar(32),
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

索引：
```
idx_res_project_ts              (project_id, ts_ms DESC)
idx_res_project_category_ts     (project_id, category, ts_ms DESC)
idx_res_project_host_ts         (project_id, host, ts_ms DESC)
idx_res_project_failed_ts       (project_id, failed, ts_ms DESC)   -- 失败率热路径
idx_res_project_slow_ts         (project_id, slow, ts_ms DESC)     -- 慢资源 Top
```

### 3. `ResourceMonitorModule`

仿 `ApiMonitorModule` 一致结构：

```
apps/server/src/resource-monitor/
├── resource-monitor.module.ts
└── resource-monitor.service.ts    // saveBatch + 5 个 aggregate* 方法
```

`GatewayService` 分流：新增 `type === 'resource'` → `resourceMonitorService.saveBatch`。

**聚合方法**：
- `saveBatch(events)` — 幂等落库（`ON CONFLICT (event_id) DO NOTHING`）
- `aggregateSummary(window)` — `totalRequests / failedCount / slowCount / p75DurationMs / totalTransferBytes`
- `aggregateCategoryBuckets(window)` — 6 类固定占位，每类 `count / failedCount / slowCount / avgDurationMs`
- `aggregateTrend(window)` — 按小时 `(count, failedCount, slowCount, avgDurationMs)`
- `aggregateSlowResources(window, limit)` — 按 `category + host + url` 分组，p75 倒序
- `aggregateFailingHosts(window, limit)` — 按 `host` 分组，`failure_rate` 倒序

### 4. Dashboard API

```
GET /dashboard/v1/resources/overview?projectId=...&windowHours=24&limitSlow=10&limitHosts=10
```

响应结构（对偶 `/api/overview`）：
```ts
{
  data: {
    summary: { totalRequests, failedCount, slowCount, p75DurationMs,
               totalTransferBytes, delta: { totalRequests, failureRatio } },
    categoryBuckets: [ { category, count, failedCount, slowCount, avgDurationMs }, ... 6 枚 ],
    trend: [ { hour, count, failedCount, slowCount, avgDurationMs } ],
    topSlow: [ { category, host, url, sampleCount, p75DurationMs, failureRatio } ],
    topFailingHosts: [ { host, totalRequests, failedCount, failureRatio } ],
  },
  source: "live" | "empty" | "error",
}
```

### 5. Web 页面 `(console)/monitor/resources/page.tsx`

组件模板（复用 ant-design/plots + 既有 Card/Badge 原语）：

```
app/(console)/monitor/resources/
├── page.tsx                  // 服务端组件 + force-dynamic + 三态 Badge
├── summary-cards.tsx         // 总样本数 / 失败率 / 慢占比 / p75 / 总传输体积
├── category-buckets.tsx      // 6 张类型卡（script/stylesheet/image/font/media/other）
├── trend-chart.tsx           // AntV Line 三折线（总量/失败/慢）
├── top-slow-table.tsx        // Top 慢资源（按 p75 倒序）
└── failing-hosts-table.tsx   // Top 失败 host（按 failure_rate 倒序）
```

### 6. Demo 场景

`examples/nextjs-demo`：
- `ghc-provider.tsx` 注册 `resourcePlugin({ slowThresholdMs: 500 })`
- 新增 `(demo)/resources/slow-script/page.tsx`（import 一段延迟外链脚本）
- 新增 `(demo)/resources/image-gallery/page.tsx`（多图并发加载，看 bytes/avgDuration）
- `demo-scenarios.ts` `resources` 分组新增 2 条路由（既有 4xx 测试路由保留）

## 备选方案

### A. 合并进 apiPlugin 一个插件全采（否决）

`apiPlugin` 已经走 fetch/XHR patch 路径，覆盖 XHR/fetch 类请求。若把 RT 数据也挂进 apiPlugin，需要把两套采集逻辑耦合在一个 setup，且 RT 的 `initiatorType` 语义与 fetch 请求完全不同（RT 是"资源加载"视角，fetch 是"业务 API"视角）。界面也无法同时呈现"慢接口 Top"与"慢图片 Top"。**拒绝**。

### B. 扩展 errorPlugin 多采一份 RT 全量数据（否决）

errorPlugin 职责是"异常上报"，混入吞吐类全量样本违反单一职责，且现有 DOM `error` 监听无法拿到 `PerformanceResourceTiming` 的 bytes/duration 等性能细节。**拒绝**。

### C. 采纳：新增独立 resourcePlugin（✅）

保持三条链路清晰边界：
- 异常层（errorPlugin）：4xx/5xx DOM 事件
- 业务层（apiPlugin）：fetch/XHR 全量明细
- 资源性能层（resourcePlugin，本 ADR）：`PerformanceResourceTiming` 全量

**优点**：模块化 / 职责清晰 / 与 ADR-0020 §4.1 保持同构；Demo 与大盘可分别独立验证。
**代价**：SDK 体积 +~1.5KB gzip（PerformanceObserver 订阅 + 分类 + URL parse），预算内。

## 影响

### SPEC
- §3.3.4 资源监控节可更详细化（保留既有描述，新增 `resource_events_raw` 字段表 + aggregate 契约）
- §5.4 Dashboard API 追加 `/dashboard/v1/resources/overview` 契约段

### ARCHITECTURE
- §1 模块拓扑：Gateway 分流箭头新增 `resource → ResourceMonitorModule`
- §3.1 模块列表新增 `ResourceMonitorModule` 行
- §8.1.1 事件流表数从 5 张 → 6 张，追加 `resource_events_raw`

### 契约变更
- `ResourceEventSchema` 新增 `category / host / slow / failed / startTime` 可选字段（向后兼容）
- `Dashboard API` 新增 `GET /dashboard/v1/resources/overview`

### 依赖
- 零新增外部依赖
- 严格遵循 .claude/rules/architecture.md：SDK 浏览器兼容、禁止绕过 GatewayModule
- 测试统一置于 `tests/` 目录（ADR-0019）

### 风险与缓解
| 风险 | 缓解 |
|---|---|
| SDK 体积超预算 | 复用 sdk `event.ts` createBaseEvent；URL parse 延迟到 dispatch 时；不引第三方 UA parser |
| RT buffer 溢出 | `PerformanceObserver({ buffered: true })` + 节流 `MAX_SAMPLES_PER_SESSION=500` |
| 与 errorPlugin 重复采样 | 明确分工：RT 链路只在 transferSize=0 等"看不见"的失败时标 failed；DOM error 仍走 error 链路 |
| resource 事件量大 | `raw` 表 30d TTL + 分批上报（Hub transport 内置 flush） |

## 后续

- **Demo 落点（已交付 2026-04-29）**：`examples/nextjs-demo/app/(demo)/resources/{slow-script,image-gallery}/page.tsx`，并在 `demo-scenarios.ts` `resources` 分组登记为「慢脚本（RT 样本）」「图片批量（RT 样本）」
- **文档落点（已交付 2026-04-29）**：
  - ✅ `GETTING_STARTED.md §7.4 静态资源采集（resourcePlugin · ADR-0022）`
  - ✅ `apps/docs/docs/sdk/resources.md` — SDK 端详解（含三链路互斥对照表）
  - ✅ `apps/docs/docs/guide/resources.md` — 大盘使用说明（含与 API 监控 / 异常分析的边界表）
  - ✅ `apps/docs/rspress.config.ts` sidebar `/sdk/` + `/guide/` 双处注册
  - ✅ `docs/ARCHITECTURE.md §5.1` 路由清单追加 `/monitor/resources` ✅ 标记
- **双向可追溯**：Demo 页面顶部 JSDoc 明确指向 ADR-0022 + `/monitor/resources` 大盘；文档 `sdk/resources.md` 与 `guide/resources.md` 相互引用

## 验收

- `pnpm typecheck` 6/6 全绿；`pnpm build` 全绿
- SDK 单测覆盖：分类矩阵（6 类）+ slow/failed 判定 + SSR 降级 + 幂等 setup
- Server 单测：saveBatch 幂等 + 5 个 aggregate 方法
- Web `/monitor/resources` 三态 Badge（live / empty / error）
- Demo `/resources/slow-script` + `/resources/image-gallery` + 既有 4xx 页面联动可见
- 菜单 nav.ts `monitor/resources` placeholder 置 `null`
