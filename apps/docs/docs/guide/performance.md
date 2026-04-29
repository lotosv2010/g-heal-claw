# 页面性能

路径：监控中心 → **页面性能** `/monitor/performance`

## 页面构成

1. **Vitals 卡片**：Core Web Vitals 当前 P75 值 + 趋势箭头
2. **趋势图**：按小时聚合的 P50 / P75 / P95 线
3. **Waterfall**：Navigation Timing 瀑布图
4. **慢页面表**：P75 LCP 倒序排列
5. **FMP 表**：首次有意义绘制倒序

> 每个指标的完整定义、计算方式和推荐阈值见 [接口说明 · 页面性能指标](/reference/performance-metrics)。瀑布图每个时间节点的解释见 [接口说明 · Navigation Timing 节点](/reference/navigation-timing)。

## 常见操作

### 定位慢页面

「慢页面表」按 LCP P75 倒序 → 点击进入单页面详情 → 查看 Navigation Waterfall 找瓶颈阶段。

### 对比发布版本

顶栏切换 `release` 过滤器，对比上线前后指标变化。

### 按设备 / 网络过滤

Dimension Tabs 支持：`device` / `network` / `browser` / `country`。

## 数据采样

SDK 默认 100% 采集 Core Web Vitals；如果流量过大，可在 `init({ sampleRate: 0.5 })` 降低采样率。
