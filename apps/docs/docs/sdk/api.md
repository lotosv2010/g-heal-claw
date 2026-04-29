# API 监控

`apiPlugin` **默认启用**，自动拦截 `fetch` 与 `XMLHttpRequest`。

> 采集字段、错误分类、TTFB 构成等口径见 [接口说明 · API 监控指标](/reference/api-metrics)。

## 黑名单

默认**不采集**自身上报 URL。若要排除其他接口：

```ts
init({
  plugins: [
    apiPlugin({
      ignoreUrls: [
        /\/health/,
        /\/metrics/,
      ],
    }),
  ],
});
```

## 采集请求 / 响应体（默认关闭）

::: warning
生产环境请谨慎开启，可能导致隐私泄露。
:::

```ts
apiPlugin({
  captureRequestBody: true,
  captureResponseBody: true,
  maxBodySize: 2048,  // 最大字节数
});
```

## 慢请求标记

耗时超过阈值的请求会额外上报一条 `slow_request` breadcrumb：

```ts
apiPlugin({
  slowThreshold: 1000,  // 默认 3000ms
});
```

## 查看数据

→ 监控中心 / [API 监控](/guide/api)
