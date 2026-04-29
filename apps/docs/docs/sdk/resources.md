# 静态资源监控

`resourcePlugin` 基于 `PerformanceObserver('resource')` 采集浏览器全量静态资源样本，驱动后台「监控中心 → 静态资源」大盘。

> 口径与 API / 错误监控严格互斥，同一条样本只会被一个链路采集。

## 启用插件

```ts
import { init, resourcePlugin } from "@g-heal-claw/sdk";

init(
  { dsn: "https://<publicKey>@<host>/<projectId>" },
  {
    plugins: [
      resourcePlugin({
        slowThresholdMs: 1000,       // 慢资源判定阈值（默认 1000ms）
        maxSamplesPerSession: 500,   // 单会话样本上限（默认 500）
        flushIntervalMs: 2000,       // 批量上报节流（默认 2s）
        maxBatch: 30,                // 单批次样本上限（默认 30）
        ignoreUrls: [/analytics/],   // URL 过滤正则
      }),
    ],
  },
);
```

## 六类固定分类

| 分类 | `initiatorType` | 典型来源 |
|---|---|---|
| `script` | `script` | 静态 `<script>`、动态注入脚本 |
| `stylesheet` | `link` (as=style) / `css` | `<link rel="stylesheet">`、CSS `@import` |
| `image` | `img` / `imageset` | `<img>`、`<picture>`、懒加载图 |
| `font` | `css` 中 `.woff2/.ttf/.otf/.eot` | CSS 引入的字体文件（按后缀归类） |
| `media` | `video` / `audio` | `<video>` / `<audio>` 的 src |
| `other` | 其他（如 `iframe` / `xslt`） | 兜底分类 |

大盘的 6 个分桶顺序固定为 `script → stylesheet → image → font → media → other`，即使某类当前窗口无样本也会占位显示。

## 三链路互斥边界

resourcePlugin 明确排除 `initiatorType ∈ { fetch, xmlhttprequest, beacon }` 的样本 —— 这部分由：

- `apiPlugin`（成功 + 失败全量，`type='api'`）
- `httpPlugin`（仅失败 + 业务 code 异常，`type='error'` · 用于异常大盘）

覆盖。三插件在源头就互斥采集，大盘统计不会重复计数。

| 来源 | 插件 | 事件 type |
|---|---|---|
| fetch / XHR 成功 + 失败明细 | `apiPlugin` | `api` |
| fetch / XHR 失败 + 业务 code ≠ 0 | `httpPlugin` | `error` |
| DOM `<img>` / `<script>` / `<link>` 404 | `errorPlugin` | `error` |
| 浏览器 RT 的静态资源全量样本 | `resourcePlugin` | `resource` |

## 失败与缓存判定

- **`failed=true`**：`transferSize === 0 && decodedBodySize === 0 && responseStart === 0`，或 `duration === 0`
- **`cache=hit`**：`transferSize === 0 && decodedBodySize > 0`（强缓存或 304）
- **`slow=true`**：`duration >= slowThresholdMs`

后台统计「失败率」时仅以 `failed=true` 为分子，`cache=hit` 的样本视为正常。

## 数据流

```
resourcePlugin
   │  （PerformanceObserver('resource') 监听 + initiatorType 过滤）
   ▼
POST /ingest/v1/events   type='resource'
   │
   ▼
Gateway 分流 → BullMQ `events-resource`
   │
   ▼
ResourceProcessor → resource_events_raw 分区表
   │
   ▼
ResourceMonitorService 物化聚合
   │
   ▼
GET /dashboard/v1/resources/overview
   │
   ▼
apps/web /monitor/resources 大盘
```

## 事件载荷（ResourceEvent）

上报到 Gateway 的事件结构（`@g-heal-claw/shared` `ResourceEventSchema`）：

```ts
{
  type: "resource",
  samples: [
    {
      url: "https://cdn.example.com/main.abc.js",
      initiatorType: "script",
      category: "script",
      duration: 1250,           // RT 耗时 ms
      transferSize: 245678,     // 实际下载字节
      encodedSize: 245678,
      decodedSize: 680123,
      startTimeMs: 1714400000123,
      failed: false,
      slow: true,
      cache: "miss" | "hit",
    },
    // ...
  ],
  // 基础字段：projectId / publicKey / sessionId / tsMs / pageUrl / ...
}
```

## 设计约束

- **SSR 降级**：非浏览器环境跳过，不抛错
- **样本上限**：单会话默认 500 条，防上报风暴
- **批量节流**：默认 2s flush 一次，单批次最多 30 条
- **互斥边界**：fetch / XHR / beacon 由 apiPlugin 覆盖，resourcePlugin 不采集

## Demo 场景（快速体验）

在 `examples/nextjs-demo` 启动后访问以下路由（见 `examples/nextjs-demo/app/demo-scenarios.ts`）：

| 路由 | 演示点 |
|---|---|
| `/resources/slow-script` | 动态注入带延迟的 `<script>`，驱动「Top 慢资源」 |
| `/resources/image-gallery` | 批量加载不同尺寸的随机图片，驱动 image 分桶 + Top 失败 Host |

> 对照：`/errors/image-load` / `/errors/js-load` 等演示的是 DOM 404 加载失败（`type='error'`），与本页 RT 全量样本（`type='resource'`）互补。

## 常见问题

**Q：为什么 fetch 请求没出现在静态资源大盘？**
A：设计决定 —— fetch / XHR / beacon 归 `apiPlugin` 管理，体现在 API 监控大盘。三链路互斥，不会重复统计。

**Q：被 Service Worker 缓存命中的资源会上报吗？**
A：会，但 `cache=hit`，不计入失败率，只影响分类计数与 duration 分布。

**Q：如何排除 CDN 埋点 / 监控 SDK 自身的资源？**
A：使用 `ignoreUrls` 正则过滤：`resourcePlugin({ ignoreUrls: [/analytics/, /cdn.ghealclaw/] })`。

**Q：CSS 里引入的 .woff2 字体归到哪一类？**
A：`font`。插件按 URL 后缀兜底，避免字体被误分到 `stylesheet`。

## 查看数据

→ 监控中心 / [静态资源](/guide/resources)
