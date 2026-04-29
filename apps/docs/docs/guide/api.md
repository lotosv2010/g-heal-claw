# API 监控

路径：监控中心 → **API 监控** `/monitor/api`

## 采集内容

SDK 自动拦截 `fetch` 与 `XMLHttpRequest`，上报：

- URL / method / status
- 请求耗时（duration）
- 请求体大小 / 响应体大小
- 错误信息（网络错误 / 跨域 / 超时）

## 页面构成

1. **Summary 卡片**：总请求量 / 错误率 / P75 耗时 / 慢请求占比
2. **Status Buckets**：按 HTTP 状态码分桶（2xx / 3xx / 4xx / 5xx）
3. **趋势图**：请求量 + 错误率双轴曲线
4. **Top 慢请求表**：按 P75 耗时倒序
5. **Top 错误请求表**：按 5xx 次数倒序
6. **Top Pages 表**：按页面聚合的请求情况

> 每个指标的口径与计算方式见 [接口说明 · API 监控指标](/reference/api-metrics)。

## 常见操作

### 定位慢接口

「Top 慢请求表」→ 点击 URL → 查看该接口的耗时分布直方图与错误明细。

### 按维度下钻

Dimension Tabs：`method` / `status` / `host` / `browser`。

### 过滤本域请求

URL 过滤器支持通配符匹配，如 `https://api.example.com/*`。

## 数据脱敏建议

SDK 默认不采集请求体与响应体。如需开启：

```ts
init({
  plugins: [
    apiPlugin({
      captureRequestBody: false,  // 生产环境建议保持 false
      captureResponseBody: false,
    }),
  ],
});
```
