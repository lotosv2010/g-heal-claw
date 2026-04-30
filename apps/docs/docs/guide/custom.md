# 自定义上报

路径：埋点分析 → **自定义上报** `/tracking/custom`

## 采集内容

SDK 的 `customPlugin` 提供三个主动业务 API，其中本页聚合 `track`（业务埋点）与 `time`（业务测速）两类：

| API | 事件类型 | 上报内容 |
|---|---|---|
| `GHealClaw.track(name, properties?)` | `custom_event` | 业务埋点（加购、下单、分享）+ 扁平属性 |
| `GHealClaw.time(name, durationMs, properties?)` | `custom_metric` | 业务测速（结算耗时、编辑器冷启动）+ 属性 |

> `GHealClaw.log(level, message, data?)` 产出的 `custom_log` 见 [日志查询](/guide/logs)。

## 页面构成

1. **Summary 5 张卡**：
   - 事件数（+% 环比）
   - 事件名基数（显示最热 name）
   - 指标样本数（+% 环比）
   - 指标 p75 / p95（ms）
   - 平均每会话事件数
2. **Top 事件表**：按触发次数倒序，展示事件 name / 计数 / 最近触发
3. **Top 指标表**：按样本数倒序，展示 metric name / 样本数 / p50 / **p75** / p95 / avg（ms）
4. **趋势图（Segmented 3 标签）**：事件趋势 · 指标样本趋势 · 指标耗时趋势
5. **Top 页面表**：按 (事件 + 指标) 总触发次数倒序的 pagePath / 次数

## 分位数口径

Top 指标表的 p50 / p75 / p95 由 PostgreSQL `percentile_cont(X) WITHIN GROUP (ORDER BY duration_ms)` **逐 name** 独立计算：

- **p75 加粗**：作为首要参考（与页面性能 Web Vitals 同口径）
- 样本数不足时 `null` 安全归零显示 0
- 24 小时默认窗口，可通过接口参数 `windowHours=1..168` 扩展

## 事件基数洞察

"事件名基数"卡片展示当前窗口内不同 `name` 的数量 + 最热 name。基数骤增通常意味着：
- 上游开始使用新埋点（预期）
- 上游拼 name 时误把动态 ID 拼入（反模式，需要排查）

## 环比算法

Summary 的 `+%` 采用"与上一等长窗口"对比口径（与性能 / 异常大盘一致）：

- 上一窗口为 0、当前窗口非 0 → 显示"持平"（避免虚高 ∞）
- 绝对值 < 0.1% → 显示"持平"
- 其他按向上↑ / 向下↓ + 百分比

## 本地联调

在 `examples/nextjs-demo` 中可直接触发：
- `/custom/track` —— 触发 4 类 `custom_event`（cart_add / checkout_success / banner_click / share_click）
- `/custom/time` —— 触发 2 类 `custom_metric`（checkout_duration 模拟 200~600ms、editor_cold_start 模拟 500~2000ms）+ 手填样本 + 60 秒离群值

## 与其他大盘的边界

| 现象 | 去哪里看 |
|---|---|
| `[data-track]` 点击 / 曝光 / form submit | [事件分析](/guide/tracking)（trackPlugin · `type='track'`） |
| 主动 `GHealClaw.track / time` | 本页面（customPlugin · `type='custom_event' / 'custom_metric'`） |
| 主动 `GHealClaw.log` | [日志查询](/guide/logs) |
| Web Vitals（LCP / INP / CLS） | [页面性能](/guide/performance) |
| fetch / XHR 耗时 | [API 监控](/guide/api) |

> 更多 SDK API 细节见 [自定义上报 SDK](/sdk/custom)。
