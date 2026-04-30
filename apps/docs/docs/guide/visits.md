# 页面访问

路径：监控中心 → **页面访问** `/monitor/visits`

> 2026-04-30 首版（ADR-0020 Tier 2.A）先落地 PV / UV / SPA 占比 / 刷新占比 / TopPages / TopReferrers；地域 / 停留时长 / 新旧用户 / UTM 渠道归因作为增量迭代推迟。

## 页面构成

1. **Summary 卡片（4 张）**：PV / UV / SPA 切换占比 / 刷新占比（带环比）
2. **访问趋势图**：按小时双系列折线 PV / UV
3. **访问页面 TOP**：按 `path` 聚合 PV / UV / 占比
4. **引荐来源 TOP**：按 `referrer_host` 聚合 PV / 占比（空值归 `direct`）

> 指标定义见 [接口说明 · 访问分析指标](/reference/visits-metrics)。

## 数据链路

```
SDK pageViewPlugin
   └─► type: "page_view"
        └─► Gateway POST /ingest/v1/events
             └─► VisitsService.saveBatch()
                  └─► page_view_raw（幂等：event_id UNIQUE）
                       └─► GET /dashboard/v1/visits/overview
                            └─► Web /monitor/visits
```

## 三态 SourceBadge

| 状态 | 触发条件 | Badge 文案 |
|---|---|---|
| `live` | 窗口内 PV > 0 | 数据来自 page_view_raw |
| `empty` | apps/server 可用但无样本 | 暂无访问样本 · 请确保 SDK pageViewPlugin 已启用 |
| `error` | apps/server 5xx / 网络失败 | 大盘 API 不可用 · 检查 apps/server |

## 查询参数

`GET /dashboard/v1/visits/overview`

| 字段 | 类型 | 默认 | 范围 |
|---|---|---|---|
| `projectId` | string | — | 必填 |
| `windowHours` | number | `24` | 1 ~ 168（7d） |
| `limitPages` | number | `10` | 1 ~ 50 |
| `limitReferrers` | number | `10` | 1 ~ 50 |

## 环比（deltaPercent / deltaDirection）

当前窗口 PV 与上一等长窗口 PV 对比：

- `up` / `down`：|Δ| ≥ 0.1%
- `flat`：|Δ| < 0.1% 或任一窗口 PV=0

## 推迟项（增量迭代）

| 能力 | 推迟原因 | 何时纳入 |
|---|---|---|
| 地域分布 | 需 MaxMind GeoLite2 许可证 + 运维 `GEOIP_DB_PATH` | 单独 ADR |
| 停留时长 / 跳出率 | 需 `page_duration` 插件 + `visibilitychange` / `pagehide` | 后续切片 |
| 新旧用户 | 需 `session_raw` + 跨窗口 deviceId 比对 | 后续切片 |
| UTM 渠道归因 | 需 Gateway 端从 URL query 抽 `utm_*` 落库 | 后续切片 |

## 相关文档

- SDK 接入：[SDK · PageView](/sdk/page-view)
- 指标口径：[访问分析指标](/reference/visits-metrics)
- 架构决策：ADR-0020 Tier 2.A
