# API 监控指标

本页定义 `/monitor/api` 所有卡片、趋势图、表格的字段。口径对齐 W3C [Resource Timing Level 2](https://www.w3.org/TR/resource-timing-2/) 与 [Fetch API](https://fetch.spec.whatwg.org/) 官方规范。

## 事件模型

SDK 通过 Monkey-patch `fetch` 与 `XMLHttpRequest` 捕获每一次 HTTP 调用，生成一条 `api` 类型事件，核心字段：

| 字段 | 含义 |
|---|---|
| `url` | 完整请求 URL |
| `host` | 从 URL 解析的 hostname |
| `method` | GET / POST / PUT / DELETE / … |
| `status` | HTTP 响应状态码；网络错误 / 被取消时为 `0` |
| `duration` | 总耗时 `responseEnd - startTime`（ms） |
| `ttfb` | 首字节时间 `responseStart - startTime`（ms） |
| `requestSize` | 请求体字节数（仅 Content-Length 可读时） |
| `responseSize` | 响应体字节数 |
| `errorType` | `network` / `timeout` / `cors` / `abort` / `http_4xx` / `http_5xx` |
| `pageUrl` | 发起请求时的页面 URL |

---

## Summary 卡片

| 卡片 | 含义 | 计算 |
|---|---|---|
| **总请求量** | 选定窗口内 API 事件数 | `COUNT(events)` |
| **错误率** | 错误请求占比 | `COUNT(WHERE errorType IS NOT NULL OR status >= 400) / COUNT(events)` |
| **P75 耗时** | 75 百分位响应时长 | `PERCENTILE(duration, 0.75)` |
| **慢请求占比** | 超过慢阈值的请求占比 | `COUNT(WHERE duration > slowThreshold) / COUNT(events)` |

**慢阈值**：默认 **3000ms**，可在 SDK `apiPlugin({ slowThreshold: 1000 })` 覆盖。Dashboard 使用的值以项目配置为准，与 SDK 阈值独立。

---

## Status Buckets（状态码桶）

横向堆叠条形图，按 `status` 首位数字分桶：

| 桶 | 范围 | 语义 |
|---|---|---|
| **2xx** | 200–299 | 成功 |
| **3xx** | 300–399 | 重定向 |
| **4xx** | 400–499 | 客户端错误（路径错、参数错、未授权、资源不存在） |
| **5xx** | 500–599 | 服务端错误 |
| **0 / Network** | `status === 0` | 网络错误 / CORS / 取消 / 离线 |

### 常见 HTTP 状态码

| Code | 含义 | 常见成因 |
|---|---|---|
| 400 | Bad Request | 参数校验失败 |
| 401 | Unauthorized | 未登录 / Token 失效 |
| 403 | Forbidden | 权限不足 |
| 404 | Not Found | 路由错 / 资源被删 |
| 408 | Request Timeout | 客户端发送太慢；生产罕见 |
| 429 | Too Many Requests | 限流 |
| 499 | Client Closed Request | 客户端主动关闭（Nginx 私有） |
| 500 | Internal Server Error | 服务端未捕获异常 |
| 502 | Bad Gateway | 反向代理上游无响应 |
| 503 | Service Unavailable | 服务过载 / 维护中 |
| 504 | Gateway Timeout | 上游超时 |

---

## 趋势图

双轴时间序列：
- **左轴**：请求量（柱状，按桶聚合）
- **右轴**：错误率（折线）

桶大小与时间窗口自适应（规则同异常分析趋势图）。

---

## Top 慢请求表

| 列 | 口径 |
|---|---|
| URL Pattern | 参数归一化后的 URL（如 `/users/123` → `/users/:id`） |
| Count | 该 Pattern 请求总数 |
| P50 | 中位耗时 |
| P75 | 75 百分位耗时 |
| P95 | 95 百分位长尾 |
| Error Rate | 错误请求占比 |

### URL 归一化

参数段识别规则（优先级降级）：
1. 纯数字 `/123` → `/:id`
2. UUID → `/:uuid`
3. 长度 ≥ 16 的字母数字混合 → `/:token`
4. 其他保留原文

业务可自定义归一化规则，避免高基数造成统计失真。

---

## Top 错误请求表

按 `status >= 500 OR errorType IS NOT NULL` 过滤后的请求，按 **错误次数倒序**。列与慢请求表一致，额外展示 **Top 错误类型** 与 **最近错误示例**（可点击跳转 Issue）。

---

## Top Pages 表

以 `pageUrl`（归一化）聚合：

| 列 | 口径 |
|---|---|
| Page | 归一化页面路径 |
| API 总请求 | 该页面内发起的所有 API 调用数 |
| 平均错误率 | `AVG(errorRate per URL pattern)` |
| 慢请求占比 | 同上 |

---

## TTFB 构成

对单条 API 事件，TTFB = 网络链路 + 服务端处理。细分与 [Navigation Timing 节点](/reference/navigation-timing) 一致：

```
TTFB = DNS + TCP + TLS + Request Sending + Server Processing + First Byte
```

Resource Timing Level 2 不暴露"服务端处理时间"；若需精确区分，需后端在响应头返回 `Server-Timing: app;dur=120`，SDK 会自动提取并上报。

---

## 错误分类细则

| `errorType` | 判定 |
|---|---|
| `network` | `fetch` 抛 `TypeError: Failed to fetch` 或 XHR `onerror` |
| `timeout` | 超过 `apiPlugin({ timeout })` 上报超时；XHR 的 `ontimeout` |
| `cors` | 预检 OPTIONS 失败 / 响应无 `Access-Control-Allow-Origin` |
| `abort` | `AbortController.abort()` 或用户关闭页面 |
| `http_4xx` / `http_5xx` | 仅按状态码分类 |

---

## 采样与脱敏

- **采样率**：遵循 `init({ sampleRate })`，API 事件同样遵守
- **忽略 URL**：`apiPlugin({ ignoreUrls: [...] })`，支持字符串 / 正则
- **Body 采集**：默认关闭；开启需同时配 `maxBodySize`（默认 2048 字节）
- **敏感头过滤**：`Authorization` / `Cookie` / `Set-Cookie` 永远不上报
