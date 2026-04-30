# ADR-0027: 转化漏斗分析切片（tracking/funnel）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-30 |
| 决策人 | @Robin |
| 关联 | ADR-0020（菜单完整化路线图，Tier 2 增补） · ADR-0024（曝光切片，同构聚合层模式） · SPEC §3.3.7 埋点事件契约 |

## 背景

`/tracking/funnel` 在 `apps/web/lib/nav.ts` 长期标注 "Phase 6 交付" 占位。但实际上：

- `track_events_raw` 已承载全量 4 类埋点（code / click / expose / submit），`event_name` 已归一化
- `(project_id, event_name, ts_ms)` 索引已就位，支持按事件名按时间窗口扫描
- 缺的只是一条聚合端点 + 一张配置页

与 ADR-0024 曝光切片同样属于"零 SDK / 零 Schema 改动、只读视图层切片"，摩擦最小、用户可见性高。

PRD §2.7 原文只规定埋点**采集**能力，未覆盖漏斗分析。本切片作为 Tier 2 Tracking 能力的自然补齐，不扩展 PRD，但在 ADR-0020 §8 路线图增补一节。

## 决策

新增 **TM.2.D Funnel Slice**，端到端交付一条聚合端点 + 一张漏斗大盘，全部复用既有数据源。

### 1. 数据源

仅从 `track_events_raw` 查询；**不新增表、不改 schema、不动 SDK、不持久化漏斗定义**。

### 2. 无状态 URL 驱动（MVP 关键取舍）

漏斗定义通过 URL query 传递（`steps=A,B,C`）而非数据库持久化，带来两个直接收益：

- **可收藏 / 可分享**：运营把链接复制给产品就是同一份漏斗配置
- **无 RBAC 依赖**：不需要等 T1.1.7 JWT + 项目成员模型落地即可上线

持久化漏斗（含命名 / 收藏 / 定时邮件）作为后续独立切片（TM.2.D-Next）推迟。

### 3. 后端（apps/server）

在既有 `TrackingService` 上追加**单个**聚合方法 `aggregateFunnel`：

```
TrackingService.aggregateFunnel({
  projectId, sinceMs, untilMs,
  steps: readonly string[],      // 2~8 步
  stepWindowMs: number,          // 步骤间最大间隔
}): Promise<FunnelStepRow[]>
```

**SQL 策略**（单次往返 + CTE 逐步推进）：

```sql
WITH scoped AS (
  SELECT COALESCE(user_id, session_id) AS uid,
         event_name, ts_ms
  FROM track_events_raw
  WHERE project_id = $projectId
    AND ts_ms >= $sinceMs AND ts_ms < $untilMs
    AND event_name = ANY($stepsArr)
),
s1 AS (
  SELECT uid, MIN(ts_ms) AS t1
  FROM scoped WHERE event_name = $step1 GROUP BY uid
),
s2 AS (
  SELECT s1.uid, s1.t1, MIN(scoped.ts_ms) AS t2
  FROM s1 JOIN scoped ON scoped.uid = s1.uid
  WHERE scoped.event_name = $step2
    AND scoped.ts_ms >= s1.t1
    AND scoped.ts_ms <= s1.t1 + $stepWindowMs
  GROUP BY s1.uid, s1.t1
),
...
SELECT
  (SELECT COUNT(*) FROM s1) AS step1_users,
  (SELECT COUNT(*) FROM s2) AS step2_users,
  ...
```

- 逐步 `LEFT JOIN` 保证严格顺序：step i 命中时间必须 `≥ step i-1 命中时间` 且 `≤ + stepWindowMs`
- 用户级去重：`COALESCE(user_id, session_id)` 同 exposure / tracking 既有口径
- `event_name = ANY(array)` 走 `idx_track_project_name_ts`

**复杂度控制**：动态 SQL 构造，最多 8 步；超过拒绝。

### 4. Dashboard 端点

`GET /dashboard/v1/tracking/funnel`

Query：

| 字段 | 类型 | 默认 | 范围 |
|---|---|---|---|
| `projectId` | string | — | 必填 |
| `windowHours` | number | 24 | 1 ~ 168（7d） |
| `steps` | string | — | CSV，2 ~ 8 项；每项 1 ~ 128 字符 |
| `stepWindowMinutes` | number | 60 | 1 ~ 1440（24h） |

响应：

```json
{
  "data": {
    "windowHours": 24,
    "stepWindowMinutes": 60,
    "totalEntered": 1234,
    "steps": [
      { "index": 1, "eventName": "view_home", "users": 1234, "conversionFromPrev": 1.0,  "conversionFromFirst": 1.0 },
      { "index": 2, "eventName": "add_cart",  "users": 456,  "conversionFromPrev": 0.37, "conversionFromFirst": 0.37 },
      { "index": 3, "eventName": "checkout",  "users": 120,  "conversionFromPrev": 0.26, "conversionFromFirst": 0.097 }
    ],
    "overallConversion": 0.097
  }
}
```

字段命名保留 `conversionFromPrev` / `conversionFromFirst`（语义明确，优于 `prevRatio` / `overallRatio`）；所有比例 0~1 浮点，保留 4 位小数。

### 5. Web（apps/web）

`/tracking/funnel`：

- **Client 配置表单**（Dynamic + URL 同步）：N 步输入框 + 窗口 / 步骤间隔选择器 + 「应用」按钮；提交即 `router.replace('?steps=...&windowHours=...')`
- **Server Component 渲染结果**（`export const dynamic = "force-dynamic"`）：读 `searchParams` → 调 `getFunnelOverview()`
- **FunnelChart**：横向条形，每步宽度 = `users / totalEntered`；条间显示 `conversionFromPrev` 百分比
- **三态 SourceBadge**（与 visits / exposure 一致）：`live` / `empty`（配置有效但无用户命中 step 1）/ `error`（API 5xx / 参数非法）
- 未配置 `steps` 时展示空白态 + 引导语 + 预设示例链接

### 6. SDK

**零改动**。MVP 建议业务侧通过 `GHealClaw.track('event_name', { ... })` 显式命名步骤事件，但被动 click / expose 埋点也可作为 step。

## 备选方案

### 方案 A：单 SQL CTE 逐步推进（已采纳）
- **优**：一次往返；PG 原生；走 `idx_track_project_name_ts`；无内存风险
- **劣**：SQL 中等复杂，N 步动态构造需要谨慎拼接

### 方案 B：多步 INNER JOIN
- **优**：可读性好
- **劣**：N 步时笛卡尔风险；走索引不理想；时间顺序约束要放在 ON 子句里，与索引列顺序冲突

### 方案 C：Node 侧 reduce（拉原始事件后 JS 计算）
- **优**：业务灵活，可支持"任意顺序访问 N 步内 M 步"等复杂策略
- **劣**：内存 / 带宽随事件量 O(N×M) 爆炸；窗口 > 24h 时直接 OOM

### 方案 D：持久化 funnels 表 + 保存命名漏斗
- **优**：长期正确方向
- **劣**：依赖 T1.1.7 RBAC；MVP 阶段阻塞交付。**推迟到独立切片**

## 影响

**成本**：~1.8d 人日；零新表 / 零新队列 / 零 SDK 改动。

**收益**：
- 覆盖 ADR-0020 Tier 2 最后一个高价值占位页
- Tracking 菜单（事件 / 曝光 / 漏斗 / 留存 / 自定义）完成 3/5

**风险**：
- SQL 构造动态 N 步需要防注入：`steps` 经 Zod 校验后作为参数数组传入，不进 SQL 文本
- 大窗口 + 高 QPS 项目可能出现慢查询：首版限 168h + 8 步，后续如命中再加 `(project_id, event_name, uid)` 复合索引

## 后续

- **任务**：`docs/tasks/CURRENT.md` TM.2.D.1 ~ TM.2.D.5（5 个子任务，总 ~1.8d） — 已全部完成（2026-04-30）
- **Demo 场景**（已交付）：`examples/nextjs-demo/app/(demo)/tracking/funnel/page.tsx`（三步示例：`view_home` → `click_cta` → `submit_form`），`pnpm dev:demo` 一键触发
- **apps/docs 使用说明**（已交付）：`apps/docs/docs/guide/tracking/funnel.md` —— 含 URL 驱动参数表、字段口径、验证链路、常见问题
- **项目文档传导**：
  - SPEC §routing：新增 `/dashboard/v1/tracking/funnel` 行
  - ARCHITECTURE §3.1：TrackingModule 职责追加「漏斗聚合」
  - ADR-0020 §8：Tier 2 落地摘要增补 funnel 一节
  - `docs/decisions/README.md`：索引补 ADR-0027
- **双向可追溯**：
  - demo 页面头注释反向引用本 ADR + apps/docs 指南
  - apps/docs 指南「关联」章节链回 demo 路径 + ADR 编号
- **后续独立切片**：持久化 funnels 表 + 命名漏斗 + A/B 对比 + 流失下钻（UA / 地域）+ 多窗口对比（TM.2.D-Next，依赖 T1.1.7 RBAC）
