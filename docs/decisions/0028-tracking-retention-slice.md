# ADR-0028: 用户留存分析切片（tracking/retention）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-30 |
| 决策人 | @Robin |
| 关联 | ADR-0020（菜单完整化路线图，Tier 2 增补） · ADR-0027（漏斗切片，同构聚合层模式） · ADR-0020 Tier 2.A 访问切片（`page_view_raw` 数据源） · SPEC §3.3.5 页面访问事件契约 |

## 背景

`/tracking/retention` 在 `apps/web/lib/nav.ts` 长期标注为占位页。

- `page_view_raw` 已承载每次页面进入事件，`session_id` 必填 / `user_id` 可空
- `(project_id, session_id, ts_ms)` 索引已就位，支持按用户按时间窗口扫描
- 缺的只是一条矩阵聚合端点 + 一张大盘页

与 ADR-0027 漏斗切片同属「零 SDK / 零 Schema 改动、只读视图层切片」，摩擦最小、用户可见性高。

PRD §2.7 只规定埋点**采集**能力，未覆盖留存分析。本切片作为 Tier 2 Tracking 能力的自然补齐，不扩展 PRD，但在 ADR-0020 §8 路线图继续增补一节。

## 决策

新增 **TM.2.E Retention Slice**，端到端交付一条矩阵聚合端点 + 一张留存大盘，全部复用既有数据源。

### 1. 数据源

仅从 `page_view_raw` 查询；**不新增表、不改 schema、不动 SDK、不持久化队列定义**。

选型理由：
- 页面访问事件覆盖所有用户（每次页面进入必发），比 `track_events_raw` 语义更接近"访问用户"
- 与 `/monitor/visits` 口径一致（PV/UV 同源）
- `session_id` 必填保证身份粒度始终有落点

### 2. 无状态 URL 驱动（沿用 ADR-0027 模式）

留存参数通过 URL query 传递：

```
/tracking/retention?cohortDays=7&returnDays=7&identity=session&since=2026-04-23T00:00:00Z&until=2026-04-30T23:59:59Z
```

- 可收藏 / 可分享 / 无 RBAC 依赖
- 持久化 Cohort（命名 / 邮件订阅）推迟到独立切片（TM.2.E-Next）

### 3. 后端（apps/server）

> 注：`page_view_raw` 归 `VisitsService` 管辖（ADR-0025 模块边界），因此聚合方法放在 `VisitsService`；Dashboard 端点仍位于 `dashboard/tracking/retention/`（用户视角的 Tracking 菜单），形成 domain=Visits / presentation=Tracking 的分层。

在既有 `VisitsService` 上追加**单个**聚合方法 `aggregateRetention`：

```typescript
VisitsService.aggregateRetention({
  projectId, sinceMs, untilMs,
  cohortDays: number,      // Cohort 数量，1~30
  returnDays: number,      // 观察天数，1~30
  identity: "session" | "user",
}): Promise<RetentionCohortRow[]>
```

**SQL 策略**（单次往返 + CTE 两步计算）：

```sql
WITH scoped AS (
  SELECT
    CASE WHEN $identity = 'user' THEN COALESCE(user_id, session_id) ELSE session_id END AS uid,
    ts_ms,
    DATE_TRUNC('day', TO_TIMESTAMP(ts_ms / 1000.0) AT TIME ZONE 'UTC') AS day_utc
  FROM page_view_raw
  WHERE project_id = $projectId
    AND ts_ms >= $sinceMs AND ts_ms < $untilMs
),
first_seen AS (
  SELECT uid, MIN(day_utc) AS cohort_day
  FROM scoped GROUP BY uid
),
visits AS (
  SELECT DISTINCT s.uid, f.cohort_day, s.day_utc
  FROM scoped s JOIN first_seen f USING (uid)
  WHERE f.cohort_day >= $cohortSinceDay  -- 只统计 cohort 窗口内的新用户
    AND s.day_utc < f.cohort_day + make_interval(days => $returnDays + 1)
)
SELECT
  cohort_day,
  (SELECT COUNT(DISTINCT uid) FROM first_seen WHERE cohort_day = v.cohort_day) AS cohort_size,
  EXTRACT(DAY FROM (day_utc - cohort_day))::int AS day_offset,
  COUNT(DISTINCT uid) AS retained
FROM visits v
WHERE day_utc >= cohort_day
GROUP BY cohort_day, day_offset
ORDER BY cohort_day, day_offset;
```

参数边界：
- `cohortDays`：1~30（默认 7）
- `returnDays`：1~30（默认 7）
- `identity`：`"session"`（默认）/ `"user"`
- 时间窗：`untilMs - sinceMs` 必须 ≥ `(cohortDays + returnDays) * 1d`，否则 400

### 4. Controller / DTO

新增 `DashboardRetentionService` 装配层：查 raw rows → 计算留存率 → 返回 DTO。

```typescript
RetentionOverviewDto {
  source: "live" | "empty" | "error",
  cohorts: Array<{
    cohortDate: string,         // ISO date "2026-04-23"
    cohortSize: number,         // day 0 新用户数
    retentionByDay: number[],   // [1.0, 0.42, 0.31, 0.27, ...] 长度 = returnDays+1
  }>,
  averageByDay: number[],       // 跨 cohort 加权平均（按 cohortSize）
  totalNewUsers: number,
  identity: "session" | "user",
}
```

**装配层计算**：
- `retentionByDay[k]` = retained(k) / cohortSize（4 位小数，day 0 固定为 1）
- `averageByDay[k]` = Σ(retained) / Σ(cohortSize)，按队列大小加权

### 5. 前端（apps/web）

`/tracking/retention` 重构为 live 页（Server Component + 三态 SourceBadge）：

- `retention-config-form.tsx` — URL 驱动表单（cohortDays / returnDays / identity 切换）
- `summary-cards.tsx` — 总新用户 / 平均 day 1 留存 / 平均 day 7 留存
- `retention-heatmap.tsx` — 留存热力矩阵（行 = cohort day，列 = day offset，格 = 留存率 + 色阶）
- `retention-chart.tsx` — 平均留存曲线（跨 cohort）

无新图表库依赖，AntV G2Plot 已在项目内（复用 funnel chart 容器）。

### 6. Demo（examples/nextjs-demo）

`examples/nextjs-demo/app/(demo)/tracking/retention/page.tsx` 演示场景：
- 3 个按钮：模拟新访客（随机 sessionId） · 模拟回访 day 1（`session_rollback=-1d` 注释） · 模拟回访 day 3
- 实际触发：正常访问页面（真实触发 pageViewPlugin）+ 文案说明"留存矩阵需要跨日数据，推荐手工造数或等 24h 后回看"
- 附 psql 造数 SQL 作为运营视角演示

## 备选方案

### 方案 A（推荐，已选）：`page_view_raw` 为数据源 + 单 CTE + 无状态 URL + 日粒度

**优点**：
- 与 Visits 大盘口径对齐（同一张 raw 表），UV 数字跨页面一致
- `session_id` 必填 → Demo 无需用户登录即可跑出矩阵
- 零 SDK / 零 Schema / 零新索引，端到端 ~2.5d

**缺点**：
- 身份粒度默认 `session_id` 下"一次浏览器清 cookie"即新用户；留存率偏低
- 本期仅"日"粒度，周/月留存需增量切片

### 方案 B：`track_events_raw` 为数据源

**做法**：以首次 `track` 事件（任意类型）作为 cohort 首日。

**缺点**：
- 与 funnel 同表，当业务未接入 trackPlugin 的页面完全漏统计
- `track_events_raw` 行数远少于 `page_view_raw`，在未落地曝光埋点的项目上几乎为空
- 与 Visits 口径不一致，UV 语义冲突

### 方案 C：持久化 Cohort 定义 + 周/月粒度同时上线

**做法**：新建 `retention_cohorts` 表 + 后台 CRUD + 预计算 job + 日/周/月三粒度。

**缺点**：
- 工期 ~8d（表结构 + RBAC + 预计算 job + UI CRUD）
- 与 ADR-0020 Tier 2 其他占位页进度失衡
- RBAC 在 T1.1.7 之前无法落地

## 影响

### 收益
- `/tracking/retention` 占位页下线
- Tier 2.E 闭环，Tracking 菜单下 4 个页面（events / exposure / funnel / retention）全 live
- 复用 ADR-0027 装配层计算模式，代码风格统一

### 成本
- `TrackingService` 新增 ~80 LOC SQL；装配层 ~60 LOC；前端 4 组件 ~250 LOC
- 单测：Service 聚合 6 case + 装配层 4 case + 前端 typecheck
- 文档：ADR + apps/docs 使用说明 + demo README

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| 冷启动项目 `page_view_raw` 无数据 → 热力矩阵全空 | 三态 SourceBadge `source=empty` 提示文案「接入 pageViewPlugin 后回看」 |
| `cohortDays × returnDays` 过大导致 SQL 超时 | 边界约束：均 1~30；窗口 ≥ 两者之和 · 1d |
| 用户清 cookie 导致 session_id 漂移 → 留存偏低 | URL `identity=user` 切换到 user_id 口径（若业务调用了 `sdk.setUser`） |

### 零行为变更承诺（对 SDK / 现有契约）
- SDK 零改动
- `page_view_raw` / `track_events_raw` schema 不变
- 现有 `/dashboard/v1/tracking/*` 端点不变
- `/tracking/funnel` 等已 live 页面不受影响

### 非目标（明确不在本切片）
- 持久化 Cohort 定义 / 命名 / 收藏 / 邮件订阅
- 周 / 月粒度
- 按渠道 / UA / 地域下钻
- 留存与流失事件关联分析
- 预测性 LTV / 流失预警

## 后续

### Demo / 使用文档
- Demo：`examples/nextjs-demo/app/(demo)/tracking/retention/page.tsx` + 附 psql 造数 SQL
- apps/docs：`apps/docs/docs/guide/tracking/retention.md`（URL 参数表 · 字段口径 · 验证链路 · 常见问题）

### 项目文档传导
- `docs/SPEC.md`：§5 新增 `/dashboard/v1/tracking/retention` 契约
- `docs/ARCHITECTURE.md`：§3.1 DashboardModule 路由清单追加
- `docs/decisions/README.md`：索引新增 ADR-0028
- `docs/decisions/0020-menu-delivery-roadmap.md` §8.2：增补本切片落地摘要
- `docs/tasks/CURRENT.md`：TM.2.E.1~5 任务 + 当前焦点更新

### 任务拆解预告（Phase 3 细化）

| ID | 标题 | 工时 | 依赖 |
|---|---|---|---|
| TM.2.E.1 | `VisitsService.aggregateRetention` + 6 case 单测 | 0.8d | 无 |
| TM.2.E.2 | `DashboardRetentionService/Controller` + 装配层 4 case 单测 | 0.6d | TM.2.E.1 |
| TM.2.E.3 | Web `/tracking/retention` live 页（4 组件）| 0.8d | TM.2.E.2 |
| TM.2.E.4 | Demo 场景 + psql 造数 SQL | 0.2d | TM.2.E.3 |
| TM.2.E.5 | 文档传导（SPEC / ARCHITECTURE / ADR-0020 / apps/docs / CURRENT）| 0.3d | TM.2.E.4 |

**预估总工时**：2.7d
