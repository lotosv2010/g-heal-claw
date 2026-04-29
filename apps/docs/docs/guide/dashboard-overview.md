# 菜单总览

Dashboard 按 **四组菜单** 组织，对应不同使用场景：

## Dashboard（综合视图）

- **数据总览** `/dashboard/overview`：跨模块健康度汇总
- **实时监控** `/dashboard/realtime`：最近 5 分钟数据流

## 监控中心（可观测核心）

| 菜单 | 路径 | 使用指南 |
|---|---|---|
| 异常分析 | `/monitor/errors` | [异常分析](/guide/errors) |
| 页面性能 | `/monitor/performance` | [页面性能](/guide/performance) |
| API 监控 | `/monitor/api` | [API 监控](/guide/api) |
| 访问分析 | `/monitor/visits` | [访问分析](/guide/visits) |
| 资源监控 | `/monitor/resources` | — |
| 日志查询 | `/monitor/logs` | — |

## 埋点分析

详见 [埋点分析](/guide/tracking)。

## 系统设置

详见 [系统设置](/guide/settings)。

## 通用交互

| 功能 | 位置 |
|---|---|
| 项目切换 | 顶栏左侧下拉 |
| 时间范围 | 顶栏中部（默认最近 24h） |
| 环境过滤 | 顶栏右侧（production / staging / development） |
| 主题切换 | 顶栏右上角（浅色 / 深色 / 跟随系统） |
| 侧栏分组折叠 | 点击分组标题，状态自动持久化 |

## URL 兼容

历史短路径（如 `/performance`）通过 301 永久重定向到分组路径（`/monitor/performance`），旧书签不受影响。

## 指标定义

所有页面出现的指标名词均在 [接口说明 · 指标字典](/reference/) 中统一定义。
