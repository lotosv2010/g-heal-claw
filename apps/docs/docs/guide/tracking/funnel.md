# 转化漏斗

路径：埋点分析 → **转化漏斗** `/tracking/funnel`

> 状态：建设中（Phase 6 交付）

## 能力规划

基于 `track_events_raw` 的多步骤转化分析：

- **漏斗定义**：按顺序选择 N 个事件名，定义"必须经过 A → B → C"
- **窗口**：允许在 X 小时内完成整条路径，超时视为流失
- **下钻**：每一步的流失率、下钻到流失样本的页面 / UA / 地域分布
- **A/B 对比**：按 `release` / `experiment` 维度对比多条漏斗曲线

## 在此之前

- 自定义点击 / 曝光 / 提交事件：[事件分析](/guide/tracking)
- 业务主动埋点：[自定义上报](/guide/custom)
- 漏斗涉及的事件名需提前通过 `data-track-*` 或 `GHealClaw.track()` 打点，数据保留期 = `track_events_raw` TTL
