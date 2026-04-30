# ADR-0024: 曝光分析切片（tracking/exposure）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-30 |
| 决策人 | @Robin |
| 关联 | ADR-0020（菜单完整化路线图） · ADR-0023（custom+logs 切片，同构聚合层模式） · P0-3 §2 事件分析大盘 · SPEC §3.3.7 埋点事件契约 |

## 背景

Tier 1 菜单完整化进入收尾阶段。`/tracking/exposure` 在 nav 配置里长期挂着 "P0-3 交付" 的 placeholder，但数据链路其实早就跑通：

- `trackPlugin` 已在 IntersectionObserver 命中且停留 ≥ `exposeDwellMs` 后写入 `track_events_raw`，`track_type='expose'`
- `target_selector` / `target_text` / `page_path` / `user_id` / `session_id` 等字段齐全
- 缺的只是一条 Dashboard 端点 + 一张 Web 页 —— 不需要新 schema、新 SDK 能力、新队列

这是典型的"只读视图层"切片：摩擦最小、用户可见性最高。

## 决策

新增 **TM.1.E Exposure Slice**，端到端交付一条聚合端点 + 一张曝光分析大盘，全部复用既有数据源。

### 1. 数据源

仅从 `track_events_raw` 中筛选 `track_type='expose'` 的子集；**不新增表、不改 schema、不动 SDK**。

### 2. 后端（apps/server）

在既有 `TrackingService` 上追加四个 expose 专用聚合（`WHERE track_type='expose'`）：

| 方法 | 返回 | 用途 |
|---|---|---|
| `aggregateExposureSummary` | 总曝光 / 去重元素 / 去重页面 / 去重用户 | summary + 环比 |
| `aggregateExposureTrend` | `TrackTrendRow[]` | 小时趋势 |
| `aggregateTopExposureSelectors` | 元素 Top N（回落 event_name） | Top 元素表 |
| `aggregateTopExposurePages` | 页面 Top N | Top 页面表 |

新增 Dashboard 装配层（与 `DashboardTrackingService` 同构，两次窗口聚合 → summary delta；其余透传 + round2）：

- `apps/server/src/dashboard/dto/exposure-overview.dto.ts` —— Zod Query + 响应 DTO
- `apps/server/src/dashboard/exposure.service.ts` —— `DashboardExposureService`
- `apps/server/src/dashboard/exposure.controller.ts` —— `GET /dashboard/v1/tracking/exposure/overview`

### 3. 前端（apps/web）

新增 `app/(console)/tracking/exposure/`：

- `page.tsx`（Server Component，`dynamic = "force-dynamic"`）
- `summary-cards.tsx`（4 张卡：总曝光 / 去重元素 / 去重页面 / 每用户曝光）
- `trend-chart.tsx`（曝光量 / 去重用户 Segmented 切换）
- `top-selectors-table.tsx`（selector + sampleText 双行展示）
- `top-pages-table.tsx`

`lib/api/exposure.ts` 承载 fetch + normalize + `OverviewSource` 判定（live / empty / error）。

`lib/nav.ts` 的 `tracking/exposure.placeholder` 翻为 `null`。

### 4. 测试

`apps/server/tests/dashboard/exposure.service.spec.ts` —— 纯装配层单测，stub 掉 TrackingService，覆盖：

- summary delta 三方向（up / down / flat）
- `exposuresPerUser` 除零保护
- 空窗口（全零 + 空数组）
- topSelectors `sharePercent` 四舍五入 2 位
- trend / topPages 透传保持顺序

共 7 个用例全绿。

## 后果

### 正面

- 补齐 Tier 1 菜单完整化的最后几个"placeholder 但数据已就绪"的坑位之一
- 零数据迁移、零 SDK 发版、零 Docker 依赖
- Top 元素大盘直接揭示"用户实际看见什么"，是 A/B 实验、运营位置评估、信息架构决策的基础视图

### 代价

- `target_selector` 的稳定性依赖业务页面正确标注 `[data-track-expose]`；不标注则回落 `event_name`，聚合粒度下降
- 曝光数据量可能显著大于 click/submit；Tier 1 未加入按 selector 的专用索引，windowHours=168 (7d) 的极端场景下可能出现慢查询，后续如有痛感再考虑 `(project_id, track_type, target_selector, ts_ms)` 复合索引

## 后续

- **Demo 场景**：`examples/nextjs-demo` 的 `/tracking/expose` 已经是 P0-3 上线时的现成演练位（`[data-track-expose]` 按钮），用户直接一键触发即可看到大盘数据
- **使用说明**：`GETTING_STARTED.md §7.3` 末尾补一行，指明 `/tracking/exposure` 大盘落点
- **后续收敛**：Tier 1 收尾后，Tier 2 的 `monitor/visits`（页面访问 + GeoIP）成为下一个切片候选
