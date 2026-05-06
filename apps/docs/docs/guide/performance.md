# 页面性能

路径：监控中心 → **页面性能** `/monitor/performance`

## 页面构成

自上而下：

1. **常用指标卡** —— FMP / TTFB / DOM Ready / 页面完全加载 / 采样数量
2. **性能视图** —— Web Vitals 24h 趋势（p75 多指标折线）
3. **页面加载瀑布图** —— Navigation Timing 各阶段耗时
4. **Core Web Vitals（三段式）** —— LCP / INP / CLS / FCP / TTFB + TBT / SI（活跃指标）；FID / TTI 标记 `Deprecated`，仅渲染历史数据
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

底部 Dimension Tabs：

| 维度 | 数据来源 | 说明 |
|------|---------|------|
| 浏览器 | `device.browser` + `device.browserVersion` | Chrome 125 / Safari 17 / Edge 125 等 |
| 操作系统 | `device.os` + `device.osVersion` | Windows 10.0 / macOS 15.4 / Android 14 等 |
| 设备类型 | `device.deviceType` | desktop / mobile / tablet / bot |
| 网络类型 | `device.network.effectiveType` | 4g / 3g / 2g（仅 Chromium 内核浏览器） |

SDK 自动采集以上字段，详见 [SDK · 设备与页面上下文](/sdk/device-context)。

### 环比对比

点击 Core Web Vitals 面板上方的「环比」Tab，当前周期与前一周期指标并列展示，delta 高亮标记改善/恶化方向。

### 分页面瀑布图

页面加载瀑布图支持通过下拉菜单选择具体 URL path，查看单页面维度的 Navigation Timing 各阶段耗时。默认展示全局聚合。

### 多指标趋势图

趋势图支持通过 Legend 切换多指标叠加（LCP + FCP + TTFB + INP + CLS），crosshair tooltip 显示精确数值与时间点。

## 数据采样

SDK 默认 100% 采集 Core Web Vitals；如流量过大，可在 `init({ sampleRate: 0.5 })` 降低采样率。详见 [SDK · 性能监控](/sdk/performance)。

## 与其他大盘的边界

| 现象 | 去哪里看 |
|---|---|
| fetch / XHR 耗时慢 | [API 监控](/guide/api) |
| 图片 / 字体 / 脚本加载慢 | [静态资源](/guide/resources) |
| 业务测速（结算耗时 / 冷启动） | [自定义上报](/guide/custom) |
| 白屏 / 关键元素缺失 | [异常分析](/guide/errors)（`white_screen` 分类） |
