# 菜单总览

Dashboard 按 **四个一级分组** 组织，与管理后台 `apps/web` 左侧菜单严格对齐：

## Dashboard（综合视图）

| 菜单 | 路径 | 使用指南 |
|---|---|---|
| 数据总览 | `/dashboard/overview` | [数据总览](/guide/dashboard/overview) |
| 实时监控 | `/dashboard/realtime` | [实时监控](/guide/dashboard/realtime) |

## 监控中心（可观测核心）

| 菜单 | 路径 | 使用指南 |
|---|---|---|
| 异常分析 | `/monitor/errors` | [异常分析](/guide/errors) |
| 页面性能 | `/monitor/performance` | [页面性能](/guide/performance) |
| API 监控 | `/monitor/api` | [API 监控](/guide/api) |
| 页面访问 | `/monitor/visits` | [页面访问](/guide/visits) |
| 静态资源 | `/monitor/resources` | [静态资源](/guide/resources) |
| 日志查询 | `/monitor/logs` | [日志查询](/guide/logs) |

## 埋点分析

| 菜单 | 路径 | 使用指南 |
|---|---|---|
| 事件分析 | `/tracking/events` | [事件分析](/guide/tracking) |
| 曝光分析 | `/tracking/exposure` | [曝光分析](/guide/exposure) |
| 转化漏斗 | `/tracking/funnel` | [转化漏斗](/guide/tracking/funnel) |
| 用户留存 | `/tracking/retention` | [用户留存](/guide/tracking/retention) |
| 自定义上报 | `/tracking/custom` | [自定义上报](/guide/custom) |

## 系统设置

| 菜单 | 路径 | 使用指南 |
|---|---|---|
| 应用管理 | `/settings/projects` | [应用管理](/guide/settings/projects) |
| Source Map | `/settings/sourcemaps` | [Source Map](/guide/settings/sourcemaps) |
| 告警规则 | `/settings/alerts` | [告警规则](/guide/settings/alerts) |
| 通知渠道 | `/settings/channels` | [通知渠道](/guide/settings/channels) |
| 成员与权限 | `/settings/members` | [成员与权限](/guide/settings/members) |
| AI 修复配置 | `/settings/ai` | [AI 修复配置](/guide/settings/ai) |
| API Keys | `/settings/tokens` | [API Keys](/guide/settings/tokens) |

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
