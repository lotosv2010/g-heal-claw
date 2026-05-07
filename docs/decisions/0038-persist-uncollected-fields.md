# ADR-0038: 未入库 SDK 字段全量持久化

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-05-07 |
| 决策人 | @gaowenbin |

## 背景

SDK 采集了丰富的设备、页面、用户上下文，但当前 Gateway → Service → DB 的 `toRow()` 映射中有 13+ 个字段仅采集未持久化（详见 SPEC §4.1.2 "未入库字段汇总"）。这导致：

1. **维度分析受限**：无法按屏幕分辨率、语言、时区做维度分布
2. **用户归因缺失**：非 track 事件无 `user_id`，UV 统计只能依赖 sessionId
3. **流量来源断链**：UTM / searchEngine / channel 采集了但无法聚合
4. **调试信息丢失**：`tags` / `context` 用户主动设置的扩展上下文无法回溯

## 决策

**将以下字段按分层策略补充入库**：

### 层级 1：全表通用字段（9 张 raw 表均新增）

| 新增列 | 类型 | SDK 来源 | 说明 |
|---|---|---|---|
| `user_id` | varchar(64) | `user.id` | track 表已有，其余 8 表新增 |
| `tags` | jsonb | `tags` | 用户自定义标签 |
| `context` | jsonb | `context` | 用户自定义上下文 |
| `screen_width` | integer | `device.screen.width` | 屏幕宽度 px |
| `screen_height` | integer | `device.screen.height` | 屏幕高度 px |
| `screen_dpr` | real | `device.screen.dpr` | 设备像素比 |
| `language` | varchar(16) | `device.language` | 浏览器语言 |
| `timezone` | varchar(64) | `device.timezone` | IANA 时区 |
| `page_title` | text | `page.title` | 页面标题 |

### 层级 2：流量归因字段（仅 page_view_raw）

| 新增列 | 类型 | SDK 来源 | 说明 |
|---|---|---|---|
| `utm_source` | varchar(128) | `page.utm.source` | 流量来源 |
| `utm_medium` | varchar(128) | `page.utm.medium` | 媒介类型 |
| `utm_campaign` | varchar(128) | `page.utm.campaign` | 营销活动 |
| `utm_term` | varchar(128) | `page.utm.term` | 关键词 |
| `utm_content` | varchar(128) | `page.utm.content` | 内容标识 |
| `search_engine` | varchar(32) | `page.searchEngine` | 搜索引擎来源 |
| `channel` | varchar(64) | `page.channel` | 业务渠道 |

### 层级 3：事件专属字段

| 新增列 | 表 | 类型 | SDK 来源 | 说明 |
|---|---|---|---|---|
| `lt_tier` | perf_events_raw | varchar(16) | `tier` | long_task 严重级别 |

### 明确不入库

| 字段 | 理由 |
|---|---|
| `user.email` / `user.name` | 隐私合规风险，不持久化 |
| `device.network.rtt` / `downlink` | 高频变化、颗粒度过细，effectiveType 已覆盖聚合需求 |
| `long_task.attribution[]` | 单条可达数 KB，对存储和索引压力大，当前无消费 UI |
| `page.referrer`（非 page_view） | page_view 已存，其余表冗余度高 |
| `resource.startTime` | 可由 ts_ms 推导 |
| `page_view.enterAt` / `leaveAt` | ts_ms + duration_ms 覆盖 |
| `error.request.bizMessage` / `statusText` | 可由 bizCode / status 推导 |

## 备选方案

### 方案 A：全字段全表（不选）

所有 17 个未入库字段全部存入所有表。
- 优点：零遗漏
- 缺点：UTM 在 error/api/resource 表中 99% 为 null（浪费存储）；attribution 导致行膨胀；隐私风险

### 方案 B：分层按需入库（选定）

按价值和语义分三层入库，UTM 仅存流量入口表，tier 仅存性能表。
- 优点：存储高效、语义正确、无隐私风险
- 缺点：跨表流量归因需 JOIN page_view（可接受）

### 方案 C：仅存 jsonb 兜底列（不选）

各表新增一个 `extra jsonb` 列，把所有未入库字段一股脑塞入。
- 优点：Schema 变更最小
- 缺点：无法按列索引、查询性能差、违反 SPEC 数据模型清晰原则

## 影响

**存储估算**（层级 1 × 9 表，假设日均 100 万事件）：
- 新增列平均每行增加 ~200B（多数字段为 nullable varchar/int，tags/context 空事件为 null）
- 日增约 200MB（在可接受范围内）

**DDL 策略**：
- 全部使用 `ALTER TABLE ADD COLUMN IF NOT EXISTS`（幂等）
- 新增列全部 nullable（不破坏存量数据）
- 无需新增索引（这些字段当前仅用于事件详情展示和维度分布，不做高频过滤查询）

**后续索引计划**：
- 若 `language` / `timezone` 维度分布需要优化，后续补 partial index

**代码影响**：
- `apps/server/src/shared/database/schema/*.ts` — 9 张表 Schema 扩列
- `apps/server/src/shared/database/ddl.ts` — 追加幂等 DDL
- `apps/server/src/modules/*/` — 各 Service `toRow()` 函数补充字段映射
- `packages/shared` — 无改动（Zod Schema 已全量定义）

## 后续

- SPEC §4.1.2 "未入库字段汇总" 表同步更新（标记已落地）
- Dashboard 维度分布组件可新增 language / timezone / screen 三个 Tab（不在本 ADR 范围）
- T3 阶段流量来源分析页面消费 UTM 字段
