# API 监控

路径：监控中心 → **API 请求监控** `/monitor/api`

## 采集内容

SDK 的 `apiPlugin` 自动拦截 `fetch` 与 `XMLHttpRequest`，上报到 `api_events_raw`：

- URL / method / HTTP status
- 请求耗时（duration，ms）
- 请求 / 响应体大小（字节）
- 错误标记（网络错误 / 跨域 / 超时 / 业务返回码异常）

## 页面构成

自上而下（整合版）：

1. **4 张汇总卡** —— 请求数 / 慢请求 / 失败数 / p75（ms）
2. **状态码分布** —— 2xx / 3xx / 4xx / 5xx / 0（网络层失败）固定占位
3. **API 性能趋势** —— Segmented 3 标签切换：样本数 · 均耗时 · 成功率
4. **Tabs 多视图** —— 慢请求 TOP · 请求 TOP · 访问页面 TOP · 异常状态码 TOP
5. **维度分布** —— 浏览器 / 操作系统 / 平台（已接入）+ 6 占位维度

> 指标定义见 [接口说明 · API 监控指标](/reference/api-metrics)。

## 状态码桶口径

| 桶 | 包含范围 | 解读 |
|---|---|---|
| `2xx` | 200-299 | 成功 |
| `3xx` | 300-399 | 重定向（通常已由浏览器跟进） |
| `4xx` | 400-499 | 客户端错误（鉴权 / 参数 / 限流） |
| `5xx` | 500-599 | 服务端错误 |
| `0` | 网络层失败（超时 / 跨域 / 断网） | 无 HTTP 响应 |

## 常见操作

### 定位慢接口

「慢请求 TOP」按 p75 倒序 → 点击 URL → 查看该接口的耗时分布与错误明细。

### 按维度下钻

Dimension Tabs：浏览器 / OS / 平台（已接入）；method / status / host / network 保留占位。

### 过滤本域请求

顶栏 URL 过滤器支持通配符匹配，如 `https://api.example.com/*`。

### 失败请求根因分析

「异常状态码 TOP」按 5xx / 4xx 次数倒序，结合「访问页面 TOP」交叉定位：**哪个页面**发出的**哪个接口**返回了异常。

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

详见 [SDK · API 监控](/sdk/api)。

## 与其他大盘的边界

| 现象 | 去哪里看 |
|---|---|
| fetch / XHR 响应 4xx / 5xx | 本页面（状态码桶 + 异常状态码 TOP） |
| fetch / XHR 超时 / 跨域 / 断网 | 本页面（状态码 `0` 桶） |
| `<img>` / `<script>` 加载慢或失败 | [静态资源](/guide/resources) |
| JS 运行时异常 | [异常分析](/guide/errors) |
