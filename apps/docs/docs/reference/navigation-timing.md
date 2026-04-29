# Navigation Timing 瀑布图节点

Dashboard 的「页面性能 → Waterfall」展示的每个时间段都对应 [W3C Navigation Timing Level 2](https://www.w3.org/TR/navigation-timing-2/) 中的一个标准时间戳。以下节点顺序严格按照 MDN 时序图。

## 官方时序图（MDN）

![PerformanceNavigationTiming 时序图 — 来源 MDN](https://mdn.github.io/shared-assets/images/diagrams/api/performance/timestamp-diagram.svg)

> 图源：[MDN · PerformanceNavigationTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming)

## 时间戳一览（按发生顺序）

| 时间戳 | 含义 |
|---|---|
| `startTime` | 导航起点（等于 `0` 或 `navigationStart`） |
| `redirectStart` / `redirectEnd` | HTTP 重定向起止 |
| `fetchStart` | 浏览器准备好请求资源（可能查缓存） |
| `domainLookupStart` / `domainLookupEnd` | DNS 解析起止 |
| `connectStart` / `connectEnd` | TCP 连接起止（含 TLS） |
| `secureConnectionStart` | TLS 握手起点 |
| `requestStart` | HTTP 请求首字节发出 |
| `responseStart` | **响应首字节到达**（= TTFB） |
| `responseEnd` | 响应最后一个字节到达 |
| `domInteractive` | HTML 解析完成，`readyState === 'interactive'` |
| `domContentLoadedEventStart` / `End` | `DOMContentLoaded` 事件起止 |
| `domComplete` | DOM 全部就绪（包括延迟脚本） |
| `loadEventStart` / `End` | `load` 事件起止 |

## 阶段差值与计算

| 阶段 | 含义 | 公式 | 关注点 |
|---|---|---|---|
| **Redirect** | 重定向耗时 | `redirectEnd - redirectStart` | 过多 301/302 跳数会直接吃掉首屏预算 |
| **App Cache / Prefetch** | 浏览器缓存判断 | `domainLookupStart - fetchStart` | 一般 0；非 0 说明命中 disk / memory cache |
| **DNS** | 域名解析 | `domainLookupEnd - domainLookupStart` | 首次访问 / 冷启动较长，可通过 `<link rel="dns-prefetch">` 预解析 |
| **TCP** | TCP 建连 | `connectEnd - connectStart` | 跨大洲或网络丢包会放大，HTTP/3 QUIC 可改善 |
| **TLS** | TLS 握手 | `connectEnd - secureConnectionStart` | 仅 HTTPS 有值；Session Resumption / TLS 1.3 可缩短 |
| **Request** | 请求发送 → 首字节 | `responseStart - requestStart` | 服务端处理 + 网络 RTT，TTFB 主力贡献者 |
| **Response / Download** | 响应接收 | `responseEnd - responseStart` | 响应体体积 + 链路带宽 |
| **DOM Processing** | HTML 解析 | `domInteractive - responseEnd` | 受阻塞脚本、同步 `<style>`、极长 HTML 影响 |
| **DOMContentLoaded** | DCL 事件执行 | `domContentLoadedEventEnd - domContentLoadedEventStart` | 同步监听器过多会拉长此段 |
| **DOM Complete** | 子资源（defer 脚本等）就绪 | `domComplete - domInteractive` | 延迟脚本、字体阻塞会体现在这里 |
| **Load Event** | `load` 事件执行 | `loadEventEnd - loadEventStart` | 第三方统计 / 广告 SDK 常集中在此 |
| **TTFB**（汇总） | 首字节时间 | `responseStart - startTime` | 详见 [页面性能 · TTFB](/reference/performance-metrics#ttfb--time-to-first-byte) |

## 如何读取

```ts
const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;

console.table({
  DNS: nav.domainLookupEnd - nav.domainLookupStart,
  TCP: nav.connectEnd - nav.connectStart,
  TLS: nav.secureConnectionStart
    ? nav.connectEnd - nav.secureConnectionStart
    : 0,
  TTFB: nav.responseStart - nav.startTime,
  Response: nav.responseEnd - nav.responseStart,
  DOM: nav.domInteractive - nav.responseEnd,
  Load: nav.loadEventEnd - nav.loadEventStart,
});
```

## Dashboard 瀑布图映射

| 瀑布图色段 | 对应时间戳差值 |
|---|---|
| 灰色 · Redirect | `redirectEnd - redirectStart` |
| 黄色 · DNS | `domainLookupEnd - domainLookupStart` |
| 橙色 · TCP | `connectEnd - connectStart` |
| 紫色 · TLS | `connectEnd - secureConnectionStart` |
| 绿色 · Request（Waiting） | `responseStart - requestStart` |
| 蓝色 · Response（Download） | `responseEnd - responseStart` |
| 青色 · DOM Parsing | `domInteractive - responseEnd` |
| 粉色 · DOM Ready | `domComplete - domInteractive` |
| 灰色 · Load | `loadEventEnd - loadEventStart` |

## 常见场景诊断

| 症状 | 在哪个段变长 | 典型成因 |
|---|---|---|
| 海外用户慢 | TCP / TLS | 缺少边缘节点；HTTP/2 多路复用或 HTTP/3 有助 |
| 同源其他页快，唯独首页慢 | Request | SSR 耗时；数据库慢查询 |
| 首屏白屏长 | DOM Parsing | 渲染阻塞 CSS / 同步脚本 |
| `load` 事件触发很晚 | DOM Complete / Load | 字体、异步 iframe、第三方 SDK 未使用 `async` |
