# 页面性能指标

所有 Core Web Vitals 口径遵循 [web.dev 官方定义](https://web.dev/articles/vitals)。阈值对应**P75**，即 75% 的真实用户会话应达标。

## 概览

| 指标 | 含义 | 推荐（P75）| 差（P75）| 采集 API | 状态 |
|---|---|---|---|---|---|
| **LCP** | Largest Contentful Paint，最大内容绘制 | ≤ 2.5s | > 4.0s | `PerformanceObserver('largest-contentful-paint')` | ✅ 活跃 |
| **INP** | Interaction to Next Paint，下一帧交互响应 | ≤ 200ms | > 500ms | `PerformanceEventTiming` | ✅ 活跃 |
| **CLS** | Cumulative Layout Shift，累计布局偏移 | ≤ 0.1 | > 0.25 | `PerformanceObserver('layout-shift')` | ✅ 活跃 |
| **FCP** | First Contentful Paint，首次内容绘制 | ≤ 1.8s | > 3.0s | `PerformancePaintTiming` | ✅ 活跃 |
| **TTFB** | Time to First Byte，首字节时间 | ≤ 800ms | > 1.8s | Navigation Timing | ✅ 活跃 |
| **FMP** | First Meaningful Paint，首次有意义绘制 | 业务自定义 | 业务自定义 | 手动 `markFMP()` | ✅ 活跃 |
| **Long Task** | 阻塞主线程 ≥ 50ms 的任务 | 业务自定义 | 业务自定义 | `PerformanceObserver('longtask')` | ✅ 活跃 |
| **TBT** | Total Blocking Time，总阻塞时间 | ≤ 200ms | > 600ms | 服务端从 Long Task 推导 | ✅ 聚合 |
| **SI** | Speed Index，视觉填充速度 | ≤ 3.4s | > 5.8s | `speedIndexPlugin` 三里程碑近似 | ✅ 活跃 |
| **FID** | First Input Delay，首次输入延迟 | ≤ 100ms | > 300ms | ~~`first-input` Observer~~ | ⚠️ 已废弃 |
| **TTI** | Time to Interactive，可交互时间 | ≤ 3.8s | > 7.3s | ~~tti-polyfill~~ | ⚠️ 已废弃 |

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

### 三级分类

g-heal-claw 在标准 Long Task 基础上按 duration 细分三级（ADR-0018）：

| 级别 | 阈值 | 含义 |
|---|---|---|
| `long_task` | 50ms ≤ duration < 2000ms | 浏览器原生 long task |
| `jank` | 2000ms ≤ duration < 5000ms | 卡顿（用户可感知） |
| `unresponsive` | duration ≥ 5000ms | 无响应（页面假死） |

SDK 通过 `classifyLongTaskTier(duration)` 纯函数标记 tier；旧版 SDK 未标记时服务端按 duration 回填。

### 排查

Chrome DevTools Performance 面板火焰图定位具体调用栈。一般处理：Web Worker 迁移、任务切片、代码拆分。

---

## TBT — Total Blocking Time <Badge type="info">Lighthouse 实验室口径</Badge>

### 定义

FCP 到 TTI（或页面隐藏）之间，所有 Long Task 中**超出 50ms 部分**的累加总和。TBT 衡量"主线程整体被阻塞的程度"，是 Lighthouse 性能评分中仅次于 LCP 权重最高的指标。

### 计算

```
TBT = Σ max(0, longTaskDuration − 50ms)
```

示例：如果 FCP~TTI 窗口内有三个 Long Task（70ms、120ms、55ms），则：

```
TBT = (70−50) + (120−50) + (55−50) = 20 + 70 + 5 = 95ms
```

### SDK 实现

g-heal-claw SDK 由 `longTaskPlugin` 采集所有 Long Task 条目。TBT 计算在**服务端聚合层**完成：

```sql
-- 对指定时间窗口内所有 long_task 事件：
SELECT SUM(GREATEST(0, duration - 50)) AS tbt
FROM long_task_events
WHERE project_id = $1 AND ts_ms BETWEEN $start AND $end
```

SDK 不独立上报 TBT 事件（无 `metric='TBT'` 的 performance event），而是由 Dashboard 根据 Long Task 原始数据实时推导。

### 阈值

| Good | Needs Improvement | Poor |
|---|---|---|
| ≤ 200ms | ≤ 600ms | > 600ms |

### 与 INP 的关系

- TBT 衡量的是**整体主线程繁忙度**（被动，不需要用户交互）
- INP 衡量的是**单次用户交互的响应速度**（主动，需要用户真正操作）
- TBT 高 → INP 大概率差（主线程忙 → 交互延迟），但反之不一定成立
- Lighthouse 使用 TBT 因为它是实验室指标（无需真实交互）；RUM 场景中 INP 更精准

---

## SI — Speed Index <Badge type="info">Lighthouse 近似，精度 ±20%</Badge>

### 定义

Speed Index 衡量页面内容的**视觉填充速度**。原始定义为视口内容从空白到完全可见的"未完成面积"积分：

```
SI = ∫₀ᵀ (1 − visualCompleteness(t)) dt
```

其中 `visualCompleteness(t)` 表示 t 时刻视口可见内容占最终内容的比例。SI 越小表示页面内容越快呈现。

### Lighthouse vs SDK 实现差异

| 维度 | Lighthouse | g-heal-claw SDK |
|---|---|---|
| 采样点 | 每一帧视频截图 | 3 个里程碑（FP / FCP / LCP） |
| 环境 | 实验室（throttled CPU + 3G） | 真实用户（RUM） |
| 精度 | 标准参考值 | ±20% 近似 |
| 用途 | CI 阈值门禁 | 趋势观察，不可替代 Lighthouse |

### SDK 计算（里程碑采样近似）

SDK `speedIndexPlugin` 将三个关键时间点线性分配视觉完整度：

| 时间点 | 视觉完整度 | 含义 |
|---|---|---|
| t < FP | 0% | 纯白屏 |
| FP (First Paint) | 10% | 页面开始出现像素 |
| FCP (First Contentful Paint) | 50% | 首个文本/图像可见 |
| LCP (Largest Contentful Paint) | 100% | 最大可见元素渲染完成 |

按**梯形法**计算各段 AUC：

```
SI ≈ [0, FP] × (1 − 0.05)         // 段 1：vc 从 0 → 0.10
   + [FP, FCP] × (1 − 0.30)       // 段 2：vc 从 0.10 → 0.50
   + [FCP, LCP] × (1 − 0.75)      // 段 3：vc 从 0.50 → 1.00
```

### 采集时机

`load` 事件后等待 `settleMs`（默认 3000ms，让 LCP 稳定）上报一次。若 `pagehide` 先触发则立即封板。

### 配置

```ts
speedIndexPlugin({
  settleMs: 3000,       // load 后等待毫秒数
  fpCompleteness: 0.1,  // FP 对应视觉完整度
  fcpCompleteness: 0.5, // FCP 对应视觉完整度
  lcpCompleteness: 1.0, // LCP 对应视觉完整度
});
```

### 阈值

| Good | Needs Improvement | Poor |
|---|---|---|
| ≤ 3400ms | ≤ 5800ms | > 5800ms |

### 失败降级

- FP 和 FCP 均缺失 → 跳过上报
- 无 `PerformanceObserver` 或不支持 `paint` → 静默 no-op
- 非浏览器环境（SSR） → 跳过

---

## FID — First Input Delay <Badge type="warning">已废弃，INP 替代</Badge>

### 定义

用户首次与页面交互（点击 / 触控 / 按键，不含滚动）时，从浏览器接收到输入事件到实际开始处理事件回调之间的**延迟时间**。仅衡量 **input delay**（不含 processing time 和 presentation delay）。

### 计算

```ts
new PerformanceObserver((list) => {
  const entry = list.getEntries()[0];
  // FID = entry.processingStart - entry.startTime
}).observe({ type: 'first-input', buffered: true });
```

FID 仅记录**第一次**交互的延迟 —— 这是其最大局限：用户整个会话中可能有多次卡顿交互，FID 只能捕获首次。

### 废弃原因

2024 年 3 月，Google 正式将 **INP** 替换 FID 成为 Core Web Vital：

| 对比 | FID | INP |
|---|---|---|
| 观察范围 | 仅首次交互 | 整个会话所有交互 |
| 衡量维度 | 仅 input delay | input delay + processing + presentation |
| 代表性 | 差（首次往往最好，后续主线程更忙） | 好（取 p98 最差交互） |

### g-heal-claw 中的处理

- **SDK 不再采集 FID 新数据**（无 `metric='FID'` 上报）
- Schema 保留 `FID` 值用于**历史数据渲染**
- Dashboard 中 FID 卡片渲染 `Deprecated` Badge，tooltip 说明"已被 INP 替代"
- 阈值保留供历史数据着色：Good ≤ 100ms / NI ≤ 300ms / Poor > 300ms

---

## TTI — Time to Interactive <Badge type="warning">已废弃，Google 不再维护</Badge>

### 定义

从导航开始到页面达到**可靠可交互**状态的时间。"可靠可交互"定义为：

1. FCP 已完成
2. 主线程存在一个 ≥ **5 秒**的安静窗口（无 Long Task）
3. 安静窗口期间没有超过 2 个正在进行的网络请求

TTI 取的是满足以上条件的安静窗口的**起始时间**。

### 计算（概念伪代码）

```
TTI = first moment after FCP where:
  - no Long Tasks in the next 5 seconds
  - at most 2 in-flight network requests in the next 5 seconds
```

实际实现依赖 `tti-polyfill`（Google 出品），已于 2024 年停止维护。

### 废弃原因

| 问题 | 说明 |
|---|---|
| 5s 静默窗口不稳定 | 单个 late-arriving Long Task 可能把 TTI 推到很晚 |
| 依赖网络请求计数 | 后台 analytics / heartbeat 请求干扰判定 |
| 与用户感知脱节 | 页面可能早就可交互，但 TTI 因后台请求卡在很后面 |
| Polyfill 停止维护 | Google 不再推荐，Lighthouse 10+ 权重为 0 |

### g-heal-claw 中的处理

- **SDK 不再采集 TTI 新数据**（无 `metric='TTI'` 上报）
- Schema 保留 `TTI` 值用于**历史数据渲染**
- Dashboard 中 TTI 卡片渲染 `Deprecated` Badge，tooltip 说明"Google 已停止维护，请关注 INP + TBT"
- 阈值保留供历史数据着色：Good ≤ 3800ms / NI ≤ 7300ms / Poor > 7300ms

---

## 指标状态总览

| 指标 | 类型 | 采集方式 | 当前状态 |
|---|---|---|---|
| LCP | Core Web Vital | `web-vitals` + PerformanceObserver | ✅ 活跃采集 |
| INP | Core Web Vital | `web-vitals` + PerformanceEventTiming | ✅ 活跃采集 |
| CLS | Core Web Vital | `web-vitals` + layout-shift Observer | ✅ 活跃采集 |
| FCP | Core Web Vital | `web-vitals` + paint Observer | ✅ 活跃采集 |
| TTFB | Core Web Vital | Navigation Timing | ✅ 活跃采集 |
| Long Task | 辅助指标 | `longTaskPlugin` + longtask Observer | ✅ 活跃采集 |
| TBT | 聚合指标 | 服务端从 Long Task 推导 | ✅ 服务端计算 |
| SI | 近似指标 | `speedIndexPlugin` 三里程碑法 | ✅ 活跃采集 |
| FMP/FSP | 业务自定义 | 手动 `markFMP()` / 未来 `fspPlugin` | ⏳ 部分就绪 |
| FID | 已废弃 | 不再采集 | ⚠️ 仅渲染历史 |
| TTI | 已废弃 | 不再采集 | ⚠️ 仅渲染历史 |
