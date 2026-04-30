# 页面性能

路径：监控中心 → **页面性能** `/monitor/performance`

## 页面构成

自上而下：

1. **常用指标卡** —— FMP / TTFB / DOM Ready / 页面完全加载 / 采样数量
2. **性能视图** —— Web Vitals 24h 趋势（p75 多指标折线）
3. **页面加载瀑布图** —— Navigation Timing 各阶段耗时
4. **Core Web Vitals（三段式）** —— LCP / FID / CLS / FCP / TTI / INP，分「优 / 中 / 差」三段占比
5. **首屏时间 FMP Top** —— 按页面聚合，FMP p75 倒序
6. **维度分布** —— 浏览器 / OS / 平台（已接入）+ 6 占位维度

> 指标定义、计算方式与推荐阈值见 [接口说明 · 页面性能指标](/reference/performance-metrics)。瀑布图时间节点见 [接口说明 · Navigation Timing 节点](/reference/navigation-timing)。

## 时间窗口

顶栏支持通过 `range` 或 `from / to` 查询参数切换时间窗口（1h / 6h / 24h / 7d），透传为 `windowHours` 到聚合接口。

## 常见操作

### 定位慢页面

「首屏时间 FMP Top」按 p75 倒序 → 锁定问题页面 → 返回顶部看「页面加载瀑布图」找瓶颈阶段（DNS / TCP / TTFB / DOM / Load）。

### 对比发布版本

顶栏切换 `release` 过滤器（如有多版本并存），对比上线前后指标变化。

### 按设备 / 平台下钻

底部 Dimension Tabs：浏览器 / OS / 平台（已接入）；device / network / country 保留占位。

## 数据采样

SDK 默认 100% 采集 Core Web Vitals；如流量过大，可在 `init({ sampleRate: 0.5 })` 降低采样率。详见 [SDK · 性能监控](/sdk/performance)。

## 与其他大盘的边界

| 现象 | 去哪里看 |
|---|---|
| fetch / XHR 耗时慢 | [API 监控](/guide/api) |
| 图片 / 字体 / 脚本加载慢 | [静态资源](/guide/resources) |
| 业务测速（结算耗时 / 冷启动） | [自定义上报](/guide/custom) |
| 白屏 / 关键元素缺失 | [异常分析](/guide/errors)（`white_screen` 分类） |
