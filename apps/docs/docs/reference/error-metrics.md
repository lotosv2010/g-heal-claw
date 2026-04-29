# 异常分析指标

本页定义 `/monitor/errors` 所有卡片、图表与列表的字段。最佳实践对齐 Sentry / Datadog Error Tracking 行业惯例。

## 核心模型：Event vs Issue

**Event**（事件）：SDK 上报的**单次**异常记录，每次抛出都独立入库。

**Issue**（问题）：对 Event 按**指纹**聚合后的逻辑分组。同一处代码 Bug 可能产生 1,000 次 Event，但只对应 **1 个 Issue**。

### 指纹（Fingerprint）计算

默认规则（按优先级降级）：
1. 错误类型 + 堆栈顶部 3 帧 + 错误消息规范化结果
2. 若无堆栈：`type + name + message` 哈希
3. 若是资源错误：`tagName + src host + status`

业务可通过 `beforeSend(event => { event.fingerprint = ['custom-key'] })` 覆盖。

---

## 分类卡片（四类）

| 分类 | 事件 type | 触发源 |
|---|---|---|
| **JS** | `error` 且 `subType = js` | `window.onerror`、`try/catch` 手动上报 |
| **Promise** | `error` 且 `subType = promise` | `unhandledrejection` |
| **Resource** | `error` 且 `subType = resource` | `<img>` / `<script>` / `<link>` 加载失败（捕获阶段） |
| **HTTP** | `error` 且 `subType = http` | API 插件标记的 4xx / 5xx / 网络错误 |

卡片上的数字为所选时间窗口内该类 **Event 总数**，小箭头为与上一同长度窗口的环比。

---

## Ranking 表列头

| 列 | 含义 | 计算 |
|---|---|---|
| **Issue 标题** | 异常类型 + 归一化消息，如 `TypeError: Cannot read property 'x' of undefined` | SDK 或后端 Processor 生成 |
| **Events** | 事件总数 | `COUNT(events)` |
| **Users** | 影响用户数（近似） | `HLL(userId)` 近似去重；见 [HLL 估算](#hll-估算) |
| **First Seen** | 首次发生时间 | `MIN(timestamp)` |
| **Last Seen** | 最近发生时间 | `MAX(timestamp)` |
| **Release** | 首次发生时的版本号 | 从 `release` 字段取 |
| **Status** | `unresolved` / `resolved` / `ignored` | 人工标记 |
| **Trend** | 该 Issue 的小趋势火花线 | 按时间桶 `COUNT(events)` |

### HLL 估算

`Users` 列使用 HyperLogLog 近似去重基数，误差率约 **0.8%**。精确值可在 Issue 详情页切到「精确模式」触发实时 `COUNT(DISTINCT userId)` 查询。

---

## 趋势图

堆叠面积图，默认 **按小时桶** 聚合 24 小时窗口。X 轴时间，Y 轴 Event 总数；颜色区分四个 `subType`。

切换时间范围后自动调整桶大小：

| 窗口 | 桶 |
|---|---|
| ≤ 1h | 1 分钟 |
| ≤ 24h | 1 小时 |
| ≤ 7d | 6 小时 |
| > 7d | 1 天 |

---

## Issue 详情页字段

### 堆栈（Stack Trace）

- 默认按**最内层在前**（V8 风格）
- 已上传 Sourcemap 会展开为源码行号
- 每一帧包含：`function` / `filename` / `lineno` / `colno` / `inApp`

### 面包屑（Breadcrumbs）

异常发生前的最近 **50 条**用户行为，按类别：`navigation` / `ui.click` / `ui.input` / `xhr` / `fetch` / `console` / `custom`。

### 标签（Tags）

Dashboard 顶部显示，可点击筛选。常见：`release` / `environment` / `browser.name` / `os.name` / `device.type` / 自定义 `tags.*`。

### 附加上下文（Contexts）

- `user`：`id` / `username` / `email` / `ip_address`
- `runtime`：`name` / `version`
- `device`：`model` / `arch` / `memory`
- `extra`：业务自定义 key-value（不建议超 8KB）

---

## 严重度（Severity）

SDK 上报的 `level`：`fatal` / `error`（默认）/ `warning` / `info` / `debug`。Dashboard 仅展示 `error` 及以上级别，其他落入日志查询（`/monitor/logs`）。

---

## 告警触发条件

| 条件 | 口径 |
|---|---|
| **新增 Issue** | 该指纹第一次被记录 |
| **Issue 重开** | 已标记 `resolved` 后再次出现 |
| **Event 突增** | `EVENTS(最近 1m) > K × AVG(events/m, 过去 1h)`，K 可配 |
| **用户数突增** | `USERS(最近 5m) > K × AVG(users/5m, 过去 1h)` |
| **Release 回归** | 新 release 下某 Issue 事件数超阈值 |
