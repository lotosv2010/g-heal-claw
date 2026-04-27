# ADR-0015: Dashboard 性能大盘 API 首版（直查 perf_events_raw + p75 聚合）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-27 |
| 决策人 | @gaowenbin |

## 背景

- `apps/web` 的 `/performance` 页当前从 `lib/fixtures/performance.ts` 读取静态 mock，真实数据链路缺失
- SDK T2.1.1（PerformancePlugin）已落地，数据通过 `apps/server` 的 GatewayModule 写入 `perf_events_raw`（ADR-0013）
- 需要最小闭环：**SDK → Gateway → DB → Dashboard API → Web UI**，让用户能在真实页面看到自家 Web Vitals
- 约束：不得改动表结构（T1.1.5 正式 Drizzle Schema 前保持兼容）；不得让 Web 直接访问 DB 或跨包 import `apps/server`

## 决策

### 1. 模块位置

在 `apps/server/src/dashboard/` 新建 `DashboardModule`，职责**仅面向 Web 前端的只读聚合**：

```
apps/server/src/dashboard/
├── dashboard.module.ts
├── performance.controller.ts    # GET /dashboard/v1/performance/overview
├── performance.service.ts       # 装配 4 次聚合查询 + 映射 Tone
└── dto/
    └── overview.dto.ts          # Zod query + response Schema
```

不拆独立 `apps/dashboard-api`，符合 ADR-0001 模块化单体。

### 2. 端点契约

```
GET /dashboard/v1/performance/overview
  ?projectId=<string>              必填
  &windowHours=<int>               可选，默认 24，[1, 168]
  &limitSlowPages=<int>            可选，默认 10，[1, 50]
```

**响应**（对齐 `apps/web/lib/api/performance.ts` 已有的 `PerformanceOverview`）：

```jsonc
{
  "data": {
    "vitals":      [{ "key": "LCP", "value": 2180, "unit": "ms", "tone": "good", "deltaPercent": 4.3, "deltaDirection": "down", "sampleCount": 12843 }, ...],
    "stages":      [{ "key": "dns", "label": "DNS 查询", "ms": 38, "startMs": 0, "endMs": 38 }, ...],
    "trend":       [{ "hour": "2026-04-27T00:00:00.000Z", "lcpP75": 2100, "fcpP75": 1380, "inpP75": 170, "ttfbP75": 590 }, ...],
    "slowPages":   [{ "url": "/checkout/review", "sampleCount": 842, "lcpP75Ms": 3820, "ttfbP75Ms": 1120, "bounceRate": 0 }, ...]
  }
}
```

空数据：`sampleCount=0` 的 Vitals 数组仍返回 5 项（LCP/FCP/CLS/INP/TTFB），`value=0`、`tone="good"`、`deltaDirection="flat"`、`deltaPercent=0`；`stages`/`trend`/`slowPages` 为空数组。前端据此渲染空态提示，不抛错。

`bounceRate` 本期恒为 0（跳出率依赖 Phase 2.3 访问分析 Processor，本期不计算）。

### 3. 聚合策略

| 指标 | SQL 实现（Drizzle `sql` 模板） |
|---|---|
| **Vitals p75 (5 项)** | `SELECT metric, percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75, COUNT(*) AS n FROM perf_events_raw WHERE project_id=$1 AND type='performance' AND metric IS NOT NULL AND ts_ms >= $2 GROUP BY metric` |
| **Vitals 环比** | 同上查询在 `[$2 - $window, $2]` 窗口跑第二次，比较 p75 差异 → `deltaPercent` / `deltaDirection` |
| **Trend (4×24 桶)** | `SELECT date_trunc('hour', to_timestamp(ts_ms/1000.0)) AS hour, metric, percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75 FROM ... WHERE metric IN ('LCP','FCP','INP','TTFB') GROUP BY hour, metric`；Node 端按 hour 合并为 `TrendBucket[]` |
| **Waterfall** | 取该窗口内 `metric='TTFB' AND navigation IS NOT NULL` 的若干行 navigation JSONB → Node 端按字段取中位数；LCP/FSP 阶段用对应 metric 的 p75 覆盖 |
| **SlowPages Top N** | `SELECT path, COUNT(*) AS n, percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS lcp_p75 FROM ... WHERE metric='LCP' GROUP BY path ORDER BY lcp_p75 DESC LIMIT N`；随后对每个 path 再取 TTFB p75 |

**索引命中**：现有 `idx_perf_project_metric_ts` 与 `idx_perf_project_path_ts` 可覆盖全部查询路径，无需新建索引。

### 4. Rating 与 Tone 映射（Node 端）

转移自 web-vitals 官方阈值（ADR-0014 已引入）：

| Metric | good ≤ | needs-improvement ≤ | > → destructive |
|---|---|---|---|
| LCP / ms | 2500 | 4000 | |
| FCP / ms | 1800 | 3000 | |
| CLS | 0.1 | 0.25 | |
| INP / ms | 200 | 500 | |
| TTFB / ms | 800 | 1800 | |

`good → "good"` / `needs-improvement → "warn"` / `poor → "destructive"`，对齐 `apps/web/lib/api/performance.ts` `ThresholdTone`。

### 5. Web 端改造（保持契约不变）

- `apps/web/lib/api/performance.ts` 的 `getPerformanceOverview()` 改为：
  ```ts
  const url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/dashboard/v1/performance/overview?projectId=${projectId}`;
  try { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw ...; return (await r.json()).data; }
  catch { return emptyOverview(); }
  ```
- `projectId` 来源：`process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "demo"`（新增 env 变量，默认 `demo`（与 examples/nextjs-demo DSN 尾段 `/demo` 对齐）；后续 T1.1.7 项目切换器接入后覆盖）
- `performance/page.tsx` 处理 `empty`（`vitals[0].sampleCount === 0`）与 `error`（fetch 抛错）两态，Badge 文案：
  - 数据正常：`<Badge variant="good">数据来自 perf_events_raw</Badge>`
  - 空态：`<Badge variant="warn">暂无数据，请确保 SDK 已接入并访问 demo</Badge>`
  - 错误：`<Badge variant="destructive">大盘 API 不可用（检查 apps/server）</Badge>`

### 6. 不做（YAGNI）

- 不建 `metric_minute` 预聚合表（T2.1.4 做）
- 不计算 Apdex（T2.1.5 做）
- 不做鉴权、项目隔离（T1.1.7 做）
- 不做环比时间窗切换 UI（Phase 6 做）
- `bounceRate` 恒为 0（Phase 2.3 做）

## 备选方案

### 方案 A：Web → Server 新增 BFF 层

在 `apps/web` 内部写 Route Handler 做二次封装。

- ❌ 现阶段 Web 与 Server 都在本地 / 相同环境部署，BFF 仅徒增一跳
- ❌ 违反 YAGNI

### 方案 B：在 `packages/shared` 定义 Dashboard DTO

把 `PerformanceOverviewDto` 共享给 Web 直接用。

- ❌ 过早抽象。当前 Web 侧 `PerformanceOverview` 与 Server 侧 DTO 可能短期内分歧（例如环比字段命名），先保持两侧独立字段 + 各自 Zod/TS 类型；稳定后再提取
- ✅ 将来抽象成本低（一次移动文件）

### 方案 C：直查 + 预聚合视图（物化视图）

PG 物化视图提前跑 p75。

- ❌ 引入额外刷新调度，增加运维面
- ❌ 本期 QPS 可控（Web 页面刷新频率低），直查可承受

**采纳理由**：最小闭环、零新表、零运维成本、与既有索引对齐。

## 影响

**收益**：
- Web 端首次看到真实生产数据，打通 SDK → UI 全链路
- Dashboard 层首次落地，为后续 Issues / API / Visits 大盘提供模板

**成本**：
- 代码新增 ~350 行（Controller + Service + DTO + Web 改造）
- 每次请求 4 次聚合 SQL；单次 24h 窗口（目前 demo 约百条事件）响应预计 < 50ms
- 前端每次进入 `/performance` 触发 SSR fetch，无缓存（`cache: "no-store"`）

**风险**：
- `percentile_cont` 为行内排序聚合，数据量上到 M 级别后会变慢 → 已记录迁移锚点到 T2.1.4（metric_minute 预聚合）
- `emptyOverview` 降级若掩盖真实错误，可能导致用户误判是"没数据"而非"后端挂了" → 用户侧 Badge 明确区分 `empty` vs `error` 两态

## 后续

- T2.1.6.x 子任务详见 `docs/tasks/CURRENT.md`
- Phase 2.1.4 接入 `metric_minute` 后，本 API 迁移到预聚合查询（Controller 契约不变）
- Phase 1.1.7 引入 JWT + ProjectGuard 后，`projectId` 改由用户 Session 派生，Web 端 env 变量废弃
- 后续 SPEC §5 Dashboard API 章节补齐（本 ADR 先于 SPEC 落地）
