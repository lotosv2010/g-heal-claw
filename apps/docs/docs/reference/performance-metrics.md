# 页面性能指标

所有 Core Web Vitals 口径遵循 [web.dev 官方定义](https://web.dev/articles/vitals)。阈值对应**P75**，即 75% 的真实用户会话应达标。

## 概览

| 指标 | 含义 | 推荐（P75）| 差（P75）| 采集 API |
|---|---|---|---|---|
| **LCP** | Largest Contentful Paint，最大内容绘制 | ≤ 2.5s | > 4.0s | `PerformanceObserver('largest-contentful-paint')` |
| **INP** | Interaction to Next Paint，下一帧交互响应 | ≤ 200ms | > 500ms | `PerformanceEventTiming` |
| **CLS** | Cumulative Layout Shift，累计布局偏移 | ≤ 0.1 | > 0.25 | `PerformanceObserver('layout-shift')` |
| **FCP** | First Contentful Paint，首次内容绘制 | ≤ 1.8s | > 3.0s | `PerformancePaintTiming` |
| **TTFB** | Time to First Byte，首字节时间 | ≤ 800ms | > 1.8s | Navigation Timing |
| **FMP** | First Meaningful Paint，首次有意义绘制 | 业务自定义 | 业务自定义 | 手动 `markFMP()` |
| **Long Task** | 阻塞主线程 ≥ 50ms 的任务 | 业务自定义 | 业务自定义 | `PerformanceObserver('longtask')` |

---

## LCP — Largest Contentful Paint

### 定义

从[用户发起导航](https://www.w3.org/TR/navigation-timing-2/#dom-performancenavigationtiming-startTime)到**视口中最大可见内容元素**完成渲染的时间。衡量"主内容何时呈现"。

候选元素：`<img>` / `<image>`（SVG） / `<video>` poster / `background-image` URL / 包含文本节点的块级容器。

### 计算

浏览器持续观察候选元素直到用户发生首次交互或页面隐藏，最后一次更新即为 LCP。SDK 在 `visibilitychange` 或 `pagehide` 时读取最终值并上报。

```ts
new PerformanceObserver((list) => {
  const entries = list.getEntries();
  const lcp = entries[entries.length - 1];
  // lcp.startTime 相对于导航起点
}).observe({ type: 'largest-contentful-paint', buffered: true });
```

### 常见成因

- 首屏关键图片未预加载 → `<link rel="preload" as="image">`
- 服务端 TTFB 过长 → 上游链路优化
- 渲染阻塞 CSS / 同步 JS → `defer` / `async` / critical CSS

---

## INP — Interaction to Next Paint

### 定义

整个页面生命周期内，**所有用户交互**（点击 / 键盘 / 触控，不含滚动）从输入到下一帧完成渲染的**最长延迟**（排除偶发离群值后的代表值）。替代 FID 成为 2024 年 3 月起的新 Core Web Vitals。

### 计算

每次交互记录三段耗时：
1. **Input delay**：输入事件到事件回调开始
2. **Processing time**：回调函数执行时长
3. **Presentation delay**：回调结束到下一帧 paint

INP = 整个会话中（第 98 百分位，限 50 次交互内）最差的单次交互总时长。

```ts
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    // entry.duration 即该交互的总延迟
  }
}).observe({ type: 'event', durationThreshold: 40, buffered: true });
```

### 常见成因

- 主线程长任务挤占（见 Long Task）
- 事件监听中执行同步重计算 / 大量 DOM 写
- 未用 `requestIdleCallback` 拆分工作

---

## CLS — Cumulative Layout Shift

### 定义

页面生命周期内**非用户触发**的布局偏移总分。偏移分数 = `impact fraction × distance fraction`，前者为偏移元素影响的视口比例，后者为最大偏移距离占视口的比例。

### 计算

浏览器以 5 秒为会话窗口，取**最大会话窗口**的累计值作为最终 CLS。用户点击 / 按键后 500ms 内的偏移不计入。

```ts
let clsValue = 0;
let sessionEntries = [];
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.hadRecentInput) continue;
    // 5s / 1s 会话窗口规则略
    clsValue = Math.max(clsValue, sessionValue);
  }
}).observe({ type: 'layout-shift', buffered: true });
```

### 常见成因

- 图片 / iframe / 广告无 `width height` 导致后置撑开
- 字体加载（FOIT/FOUT） → `font-display: optional` 或预加载
- 注入顶部横幅 / 骨架屏切换

---

## FCP — First Contentful Paint

### 定义

浏览器首次在屏幕上绘制**任意 DOM 文本、图像、非白色 canvas、SVG** 的时间。反映用户是否看到"页面开始加载"。

### 计算

```ts
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.name === 'first-contentful-paint') {
      // entry.startTime
    }
  }
}).observe({ type: 'paint', buffered: true });
```

---

## TTFB — Time to First Byte

### 定义

从导航请求发出到接收到**响应首字节**的时间。覆盖 DNS / TCP / TLS / 重定向 / 服务端处理 / 网络传输。

### 计算

```ts
const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
const ttfb = nav.responseStart - nav.startTime;
```

TTFB 的详细构成见 [Navigation Timing 节点](/reference/navigation-timing) 中各阶段差值。

---

## FMP — First Meaningful Paint（业务自定义）

### 定义

W3C 已**不再推荐**通用 FMP，g-heal-claw 采用**业务手动标记**方式：由前端在首屏关键内容渲染完成时显式调用 `markFMP()`。例如电商的商品卡片、内容站的正文首段、Dashboard 的首屏图表。

### 计算

```ts
import { markFMP } from "@g-heal-claw/sdk";

requestAnimationFrame(() => markFMP());
// SDK 记录 performance.now() 作为 FMP 相对时间
```

---

## Long Task

### 定义

主线程连续占用 ≥ **50ms** 的任务。可能是长 JavaScript 执行、长布局计算、长回调。是 INP / TBT 恶化的主要因素。

### 计算

```ts
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    // entry.startTime / entry.duration
  }
}).observe({ type: 'longtask', buffered: true });
```

SDK 默认上报 ≥ 50ms 的任务；可通过 `performancePlugin({ longTaskThreshold: 100 })` 调整。

### 排查

Chrome DevTools Performance 面板火焰图定位具体调用栈。一般处理：Web Worker 迁移、任务切片、代码拆分。
