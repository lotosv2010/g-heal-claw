# 埋点分析

路径：埋点中心 → **埋点分析** `/tracking/*`

## 五个子菜单

| 菜单 | 路径 | 状态 | 用途 |
|---|---|---|---|
| 事件分析 | `/tracking/events` | ✅ P0-3 已交付 | 4 类埋点事件（click / expose / submit / code）全量聚合 |
| 曝光分析 | `/tracking/exposure` | 建设中 | 元素进入视口的曝光明细 |
| 漏斗分析 | `/tracking/funnel` | 建设中 | 多步骤转化率 |
| 留存分析 | `/tracking/retention` | 建设中 | 次日 / 7 日 / 30 日留存 |
| 自定义上报 | `/tracking/custom` | 建设中 | 自定义事件 / 指标 / 日志 |

## 事件分析大盘（P0-3）

数据源 `track_events_raw`（trackPlugin 上报），路径：`/tracking/events`。

### 页面布局

1. **4 张汇总卡**：总事件数 + 环比 · 去重用户（user ∪ session）· 事件名数 · 每会话事件数
2. **事件类型分布**：click / expose / submit / code 四桶固定占位
3. **事件趋势**：按小时聚合，支持「事件数 / 去重用户」切换
4. **Tabs**：事件 TOP（按 event_name + track_type）· 页面 TOP（按 page_path 聚合）

### 汇总卡字段含义

| 字段 | 来源 | 用途 |
|---|---|---|
| 总事件数 | `COUNT(*)` | 窗口内入库条数；环比 = (本窗口 − 上等长窗口) / 上等长窗口 |
| 去重用户 | `COUNT(DISTINCT COALESCE(user_id, session_id))` | user_id 缺失时回退 session_id，兼顾匿名访客 |
| 事件名数 | `COUNT(DISTINCT COALESCE(event_name, '-'))` | 触达的不同事件名数量；反映埋点覆盖广度 |
| 每会话事件数 | `总事件数 / 去重 session` | 反映单次会话的交互密度 |

### 事件类型分布

固定展示 4 个桶（空窗口时 count=0，ratio=0）：

| 桶 | 对应 `trackType` | 典型来源 |
|---|---|---|
| click | `click` | `[data-track]` / `[data-track-id]` 元素点击 |
| expose | `expose` | `[data-track-expose]` 元素曝光 |
| submit | `submit` | form 提交 |
| code | `code` | `GHealClaw.track(name, props)` 主动埋点 |

### 数据源字段

`track_events_raw` 关键列（详见 `apps/server/src/shared/database/schema/track-events-raw.ts`）：

- `event_id`（UNIQUE）、`project_id`、`public_key`、`session_id`、`user_id`
- `ts_ms`（事件发生时间）、`track_type`（4 种枚举）、`event_name`
- `target_selector`、`target_tag`、`target_id`、`target_class`、`target_text`
- `properties`（JSONB，自动采集的 `data-track-*` + `__name`）
- `page_url`、`page_path`、`release`、`environment`、`ua`、`browser`、`os`、`device_type`

### 后端 API

`GET /dashboard/v1/tracking/overview`：

| Query | 类型 | 默认 | 说明 |
|---|---|---|---|
| `projectId` | string | 必填 | 项目 ID |
| `windowHours` | number | 24 | 聚合窗口（1~168 小时） |
| `limitEvents` | number | 10 | Top 事件返回条数（1~50） |
| `limitPages` | number | 10 | Top 页面返回条数（1~50） |

接入方式见 [SDK · 埋点上报](/sdk/tracking)。
