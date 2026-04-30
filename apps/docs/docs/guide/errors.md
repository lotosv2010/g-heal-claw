# 异常分析

路径：监控中心 → **异常分析** `/monitor/errors`

## 页面构成

自上而下：

1. **9 分类卡片** —— JS / Promise / 白屏 / Ajax / JS 加载 / 图片加载 / CSS 加载 / Media / 接口返回码
2. **错误排行表** —— 列：类型 / 内容 / 状态 / 次数（占比）/ 复现率 / 影响用户（占比）/ 操作
3. **异常分析堆叠图** —— 9 类目 + 全部日志共 10 条图例，可点击切换显隐
4. **维度 Tabs** —— 机型 / 浏览器 / 操作系统 / 版本 / 地域 / 运营商 / 网络 / 平台

数据源：`error_events_raw`（errorPlugin 被动捕获）；resource 子类由 `resource_kind` 拆分为 4 项；`api_code` 来自 httpPlugin 的 API 返回码判定。

> 每张卡片 / 每列表格的字段定义见 [接口说明 · 异常分析指标](/reference/error-metrics)。

## 9 分类说明

| 分类 | 触发来源 | SDK 插件 |
|---|---|---|
| `js` | `window.onerror` / try-catch 抛出的运行时异常 | errorPlugin |
| `promise` | `unhandledrejection` | errorPlugin |
| `white_screen` | 首屏关键元素检测失败 | errorPlugin |
| `ajax` | fetch / XHR 网络层异常（跨域 / 超时 / 断网） | httpPlugin |
| `js_load` | `<script>` 加载失败 | errorPlugin |
| `image_load` | `<img>` 加载失败 | errorPlugin |
| `css_load` | `<link rel="stylesheet">` 加载失败 | errorPlugin |
| `media` | `<video>` / `<audio>` 加载失败 | errorPlugin |
| `api_code` | fetch / XHR 响应 4xx / 5xx（按业务码判定） | httpPlugin |

## 常见操作

### 查看原始堆栈

错误排行表 → 点击「操作」展开 → 「堆栈」Tab。若已上传 Sourcemap，会自动还原为源码行号。

### 按维度下钻

底部 Dimension Tabs 支持切换 8 个维度，查看该维度下的异常分布占比。其中「浏览器 / 操作系统 / 平台」已接入真实聚合，其余 5 项为占位。

### 标记为「已解决」

Issue 详情右上角 → 「标记已解决」。下次再出现时会重新激活并告警（regression）。

### 创建告警规则

Issue 详情右上角 → 「创建告警」。支持：
- 新增事件 / 次数超阈值 / 用户数超阈值

## Sourcemap 未生效

堆栈仍是压缩代码时，请参考 [SDK · Sourcemap 上传 · 排查](/sdk/sourcemap#排查) 逐项核对。

## 与其他大盘的边界

| 现象 | 去哪里看 |
|---|---|
| `GHealClaw.log('error', ...)` 主动日志 | [日志查询](/guide/logs) |
| fetch / XHR 耗时 / 慢请求 | [API 监控](/guide/api) |
| `<img>` / `<script>` 加载慢（未失败） | [静态资源](/guide/resources) |
| 业务主动 `GHealClaw.track / time` | [自定义上报](/guide/custom) |
