# 埋点分析

路径：**埋点分析** `/tracking/*`

> 本组功能正在建设中（P0-3 里程碑）。

## 五个子菜单

| 菜单 | 路径 | 用途 |
|---|---|---|
| 事件埋点 | `/tracking/events` | 代码埋点上报的自定义事件 |
| 曝光监测 | `/tracking/exposure` | 元素进入视口的曝光数据 |
| 漏斗分析 | `/tracking/funnel` | 多步骤转化率 |
| 留存分析 | `/tracking/retention` | 次日 / 7 日 / 30 日留存 |
| 自定义上报 | `/tracking/custom` | 自定义事件 / 指标 / 日志 |

## 上报方式

SDK 提供 `track`、`exposure`、`customEvent`、`customMetric`、`customLog` 五个方法，详见 [SDK · 埋点上报](/sdk/tracking)。

## 事件字段约定

| 字段 | 必填 | 说明 |
|---|---|---|
| `event` | ✅ | 事件名，建议 `<domain>_<action>` 命名，如 `checkout_submit` |
| `props` | - | 自定义属性，扁平键值对 |
| `userId` | - | 建议通过 `setUser` 全局设置 |
| `sessionId` | 自动 | SDK 生成 |

## 漏斗配置

在「漏斗分析」页点击「创建漏斗」→ 选择 3~10 个事件 → 设置时间窗口（默认 30 分钟）。

## 留存计算口径

以事件 **首次发生日** 为 Day 0，后续 N 日内再次发生该事件的用户占比为 Day-N 留存率。
