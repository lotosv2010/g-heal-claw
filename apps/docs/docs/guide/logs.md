# 自定义日志

路径：监控中心 → **自定义日志** `/monitor/logs`

## 采集内容

SDK 的 `customPlugin` 通过主动 API `GHealClaw.log(level, message, data?)` 产出 `type='custom_log'`，与被动捕获的异常监控 `errorPlugin` 形成互补：

| 采集路径 | 插件 | 事件 type | 大盘 |
|---|---|---|---|
| 主动分级日志 | `customPlugin.log` | `custom_log` | 本页面（监控 → 自定义日志） |
| 被动异常捕获 | `errorPlugin` | `error` | [异常分析](/guide/errors) |

> `custom_log` 仅由业务代码显式触发，不会自动捕获 `window.error` / `unhandledrejection`。

## 页面构成

1. **Summary 4 张卡**：
   - 日志总数（+% 环比）
   - Info（占比 %）
   - Warn（占比 %）
   - Error（错误率 + pp 环比）
2. **级别分桶**：info / warn / error 三级别**固定占位**（某级别无数据时占位 0）
3. **日志趋势图**：info / warn / error 三折线按小时聚合，图例可切换
4. **Top 消息表**：按 `(level, messageHead 前 128 字符)` 分组，倒序 Top 10，展示级别 Badge / 消息前缀 / 触发次数 / 最近一次

## 级别颜色

| 级别 | 色系 | Badge |
|---|---|---|
| info | 天蓝 `sky-600` | 蓝 |
| warn | 琥珀 `amber-600` | 黄 |
| error | 玫红 `rose-600` | 红 |

## 环比算法

- **日志总数 +%**：与上一等长窗口对比；上一窗口 0 且当前非 0 → "持平"（避免虚高 ∞）
- **错误率 pp**：`errorRatio = errors / total`；当前 vs 上一窗口的绝对差（百分点），|diff| < 0.0001 → "持平"；向上↑（变差）用 red，向下↓（改善）用 emerald

## 防日志风暴约束

SDK 侧已做 3 层保护，避免日志洪水打爆大盘：
- 单会话 200 条上限（默认）
- `data` JSON 字节上限 8192（超出截断并追加 `__truncated: true`）
- 循环引用兜底为 `{ __truncated: true, __reason: "serialize_failed" }`

详见 [SDK 自定义上报](/sdk/custom)。

## 本地联调

在 `examples/nextjs-demo` 中直接触发：
- `/custom/log` —— 4 类演示：info · warn · error · 大 payload（触发截断分支）

## 与其他大盘的边界

| 现象 | 去哪里看 |
|---|---|
| `console.error` / `window.error` | [异常分析](/guide/errors) |
| unhandledrejection | [异常分析](/guide/errors) |
| 业务主动 `GHealClaw.log(...)` | 本页面 |
| 业务主动 `GHealClaw.track / time` | [自定义上报](/guide/custom) |
