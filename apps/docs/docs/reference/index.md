# 指标字典

本章节收录 Dashboard 所有模块出现的指标定义、计算方式和推荐阈值，作为**唯一权威口径**。前端页面上的缩写、卡片标题、列头均可在此回查。

## 四张表

| 分类 | 链接 | 内容 |
|---|---|---|
| 页面性能 | [页面性能指标](/reference/performance-metrics) | Core Web Vitals（LCP / INP / CLS / FCP / TTFB）+ FMP + Long Task |
| 导航时序 | [Navigation Timing 瀑布图节点](/reference/navigation-timing) | 瀑布图上 12 个时间节点（domainLookup / connect / response / domInteractive 等）的定义与计算 |
| 异常分析 | [异常分析指标](/reference/error-metrics) | Issue / Events / Users / First Seen / Last Seen / 严重度 |
| API 监控 | [API 监控指标](/reference/api-metrics) | 请求耗时、错误率、状态码桶、慢请求阈值、TTFB |

## 统一约定

- **百分位**：没有特殊说明时，P50 / P75 / P95 分别代表**中位数 / 推荐基线 / 长尾**。产品级 SLA 通常锁定 P75。
- **时间单位**：毫秒（ms），除非标注 `s`。
- **聚合粒度**：Dashboard 支持 1m / 5m / 1h / 1d 四档，默认随时间窗口自适应。
- **口径来源**：优先遵循 [W3C Web Performance Working Group](https://www.w3.org/webperf/) 与 [web.dev / Core Web Vitals](https://web.dev/vitals/) 官方定义，平台不做私有修改。
