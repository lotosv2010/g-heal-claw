# g-heal-claw 技术规格说明书

> 版本: 2.0.0 | 日期: 2026-04-27
>
> **文档层级：PRD（什么）→ SPEC（契约）→ ARCHITECTURE（拓扑）→ DESIGN（为什么）**

---

## 1. 概述

g-heal-claw 是一站式前端可观测 + 自愈修复平台（Real User Monitoring + Self-Healing）。SDK 采集真实用户端的性能、异常、API、资源、页面、行为埋点数据 → 后端聚合分析 → 可视化面板 → 智能告警 → AI Agent 诊断并自动生成修复 PR。

本文档定义功能规格：SDK 接口、HTTP 契约、数据模型、行为规则。技术架构见 `ARCHITECTURE.md`，技术选型理由见 `DESIGN.md`。

---

## 2. 术语定义

| 术语 | 含义 |
|---|---|
| Project | 一个被监控的业务应用，持有独立 DSN 与 Sourcemap 空间 |
| Release | 应用发布版本号（语义化版本或 commit hash） |
| Environment | 运行环境（production / staging / development 等） |
| Event | SDK 上报的最小数据单元，含多种子类型 |
| Session | 用户一次连续会话，30 分钟无操作则失效 |
| Issue | 按指纹聚合的异常问题，含出现次数、影响用户数 |
| Fingerprint | 异常指纹，基于 `type + message + top-frame` 计算 |
| Apdex | 应用性能指数：`(满意样本 + 容忍样本/2) / 总样本` |
| Heal PR | AI Agent 针对 Issue 自动生成的修复 Pull Request |

---

## 3. SDK 规格（`@g-heal-claw/sdk`）

### 3.1 初始化

```typescript
interface GHealClawOptions {
  dsn: string;                          // 必填，格式 https://<publicKey>@<host>/<projectId>
  release?: string;                     // 版本号或 commit hash，用于 Sourcemap 匹配
  environment?: string;                 // 默认 "production"
  sampleRate?: number;                  // 全量事件采样 0-1，默认 1.0
  errorSampleRate?: number;             // 异常采样，默认 1.0
  performanceSampleRate?: number;       // 性能采样，默认 0.3
  tracingSampleRate?: number;           // API 链路采样，默认 0.3
  maxBreadcrumbs?: number;              // 面包屑容量，默认 100
  maxBatchSize?: number;                // 单批事件数，默认 30
  flushInterval?: number;               // 批量 flush 间隔 ms，默认 5000
  transport?: 'beacon' | 'fetch' | 'image' | 'auto';   // 默认 auto
  enablePerformance?: boolean;          // 默认 true
  enableApiTracking?: boolean;          // 默认 true
  enableResourceTracking?: boolean;     // 默认 true
  enablePageView?: boolean;             // 默认 true
  enableAutoTrack?: boolean;            // 全埋点，默认 false
  enableWhiteScreenDetect?: boolean;    // 白屏检测，默认 true
  slowApiThreshold?: number;            // 慢请求阈值 ms，默认 2000
  ignoreErrors?: (string | RegExp)[];   // 忽略异常匹配
  ignoreUrls?: (string | RegExp)[];     // 忽略 API URL
  beforeSend?: (event: SdkEvent) => SdkEvent | null;   // 发送前拦截
  debug?: boolean;
}

GHealClaw.init(options: GHealClawOptions): void;
```

**初始化行为**：
- 解析 DSN → `publicKey`、`host`、`projectId`；无效则 no-op 并打印警告。
- `sampleRate` 按事件求值：`Math.random() < sampleRate`；子类型采样率独立生效，取最小值。
- `beforeSend` 返回 `null` 则丢弃；可用于过滤 Token/密码/PII。
- SDK 必须在 `<head>` 尽早执行，全部 API 在初始化前调用应入队缓存，初始化后统一 flush。
- SDK 体积约束：gzip < 15KB（核心 + 错误 + 性能），全量 < 30KB。
- 对宿主页面的性能开销 ≤ 2%（CPU 占用 + 首屏阻塞时间）。

### 3.2 公开 API

| API | 说明 |
|---|---|
| `setUser(user: { id: string; email?: string; name?: string })` | 设置用户身份，附加到所有后续事件 |
| `setTag(key: string, value: string)` | 设置全局标签 |
| `setContext(key: string, value: Record<string, unknown>)` | 设置全局上下文 |
| `captureException(error: Error, ctx?: Record<string, unknown>): string` | 手动捕获异常，返回 eventId |
| `captureMessage(msg: string, level?: 'info' \| 'warning' \| 'error'): string` | 捕获自定义消息 |
| `addBreadcrumb(breadcrumb: Breadcrumb)` | 追加面包屑 |
| `track(eventName: string, properties?: Record<string, unknown>)` | 上报自定义事件（代码埋点） |
| `time(name: string, durationMs: number, properties?: Record<string, unknown>)` | 上报自定义耗时指标 |
| `log(level: 'info' \| 'warn' \| 'error', msg: string, data?: unknown)` | 上报分级日志 |
| `startTransaction(name: string): Transaction` | 开启手动性能事务 |
| `flush(timeoutMs?: number): Promise<boolean>` | 立即 flush 队列 |
| `close(): Promise<void>` | 停止采集并 flush |

### 3.3 自动采集能力

#### 3.3.1 异常监控

| 来源 | 处理器 | 字段 |
|---|---|---|
| JS 运行时异常 | `window.onerror` | message, source, lineno, colno, stack |
| Promise 未处理拒绝 | `unhandledrejection` | reason（Error 或字符串） |
| 静态资源错误 | 捕获阶段 `error` 监听（script/link/img/audio/video） | url, tagName, outerHTML |
| 框架错误 | `React ErrorBoundary` / `Vue.config.errorHandler` 兜底接入 | 组件栈 |

- SDK 包裹已有处理器，链式调用不打断用户原处理。
- 白屏检测：`requestIdleCallback` 后采样页面关键节点（`#app` / `#root` / `main`）的可视尺寸与 DOM 子节点数，阈值触发时上报 `type=white_screen` 错误。

#### 3.3.2 性能监控

**采集实现（ADR-0014）**：

| 指标 | 采集方式 | 上报时机 |
|---|---|---|
| LCP | `web-vitals@^4` `onLCP(cb)` — 底层 `PerformanceObserver('largest-contentful-paint')` | `pagehide` / `visibilitychange=hidden` 最终值 |
| FCP | `web-vitals@^4` `onFCP(cb)` — 底层 `PerformanceObserver('paint')` 取 `first-contentful-paint` | 首次可用即上报 |
| CLS | `web-vitals@^4` `onCLS(cb)` — 底层 `PerformanceObserver('layout-shift')` 会话级最大窗口累计 | `pagehide` / `visibilitychange=hidden` 最终值 |
| INP | `web-vitals@^4` `onINP(cb)` — 底层 `PerformanceObserver('event')` + `interactionId` 聚合 | `pagehide` / `visibilitychange=hidden` 最终值 |
| TTFB | `web-vitals@^4` `onTTFB(cb)` ≡ `navigation.responseStart - navigation.activationStart` | 首次可用即上报 |
| 页面加载瀑布 | SDK 自采 `performance.getEntriesByType('navigation')[0]` → 见 §4.2.1 计算公式；**挂载到 TTFB 事件的 `navigation` 字段**，不新增事件类型 | `load` 事件后立即采集，随 TTFB 事件一并上报 |
| 首屏时间（FSP） | `MutationObserver` 监听 DOM 变化，`requestAnimationFrame` 窗口内最后一次计入（T2.1.2 落地） | 首次满足判定即上报 |
| 长任务（long_task） | `PerformanceObserver('longtask')` + `lt_duration_ms`，按 duration 三级分类：`long_task` 50ms~2s / `jank` 2s~5s / `unresponsive` ≥5s（T2.1.3 / T2.1.8 落地） | 触发即入队，`subType=tier` 用于服务端分级聚合 |
| TBT（Total Blocking Time） | 由 `longTaskPlugin` 在窗口关闭时用 FCP~TTI 窗口内 `sum(max(0, duration-50))` 推导；非独立 Observer | `pagehide` / `visibilitychange=hidden` 封板一次 |
| SI（Speed Index，Lighthouse 近似） | `PerformanceObserver('paint' + 'largest-contentful-paint')` 三里程碑（FP/FCP/LCP）梯形法 AUC 近似，精度 ±20%，仅供趋势参考 | `load` 后 `settleMs=3000ms` 封板上报 |

**Rating 阈值（核心 Web Vitals 由 `web-vitals` 透传；TBT/SI 为 Lighthouse 阈值；FID/TTI 已废弃但仍保留阈值以供历史数据渲染）**：

| 指标 | `good` ≤ | `needs-improvement` ≤ | `poor` > | 状态 |
|---|---|---|---|---|
| LCP | 2500 ms | 4000 ms | 4000 ms | Core Web Vital |
| FCP | 1800 ms | 3000 ms | 3000 ms | Core Web Vital |
| CLS | 0.1 | 0.25 | 0.25 | Core Web Vital |
| INP | 200 ms | 500 ms | 500 ms | Core Web Vital（2024.3 取代 FID） |
| TTFB | 800 ms | 1800 ms | 1800 ms | Core Web Vital |
| FSP | — | — | — | 自定义首屏（T2.1.2 落地后启用阈值） |
| TBT | 200 ms | 600 ms | 600 ms | Lighthouse 实验室口径 |
| SI | 3400 ms | 5800 ms | 5800 ms | Lighthouse 实验室口径，SDK 近似 ±20% |
| FID | 100 ms | 300 ms | 300 ms | **已废弃**，INP 替代 |
| TTI | 3800 ms | 7300 ms | 7300 ms | **已废弃**，Google 不再维护 polyfill |

> PRD §2.1 标注的"INP ≤ 100ms / TTFB ≤ 200ms"为**仪表盘默认告警阈值**（可配置），与采集侧 rating 阈值解耦，两者互不替代。

- SDK 单事件单指标上报（`metric ∈ {LCP, FCP, CLS, INP, TTFB, FSP, FID, TTI, TBT, SI}`），避免 LCP/INP/CLS 最终值时机与 FCP/TTFB 即时上报时机冲突。
- 废弃指标（FID / TTI）SDK 不采集新数据，仅保留 Schema 值用于历史数据渲染；UI 侧渲染「Deprecated」Badge 并在 tooltip 说明替代指标。
- 非浏览器环境（SSR / Web Worker）或浏览器无 `PerformanceObserver` 时插件静默降级为 no-op，不抛错。

#### 3.3.3 API 监控

- 劫持 `XMLHttpRequest.prototype.open/send` 与 `window.fetch`。
- 对每个请求生成 `ApiEvent`：method、url、status、duration、requestSize、responseSize。
- 异常请求（状态码 ≥ 400 / 网络错误 / 超时）额外记录请求参数与响应片段（默认前 2KB，可配置）。
- 注入 `x-trace-id`（若存在后端链路追踪），支持前后端链路串联。
- 慢请求：超过 `slowApiThreshold` 标记 `slow=true`。

#### 3.3.4 资源监控

- `PerformanceObserver('resource')` 采集 script/link/img/font/media 等 `PerformanceResourceTiming`。
- 记录加载耗时、`transferSize` / `encodedBodySize` / `decodedBodySize`、是否命中缓存、CDN 主机、协议。
- 失败资源由异常监控捕获，与资源监控按 url 串联。
- 后端按 `initiatorType` 聚合：每个项目/环境/小时粒度产出 `count`、`totalTransfer`、`avgDuration`，供大盘「按资源类型拆分的总大小与请求数量」使用。

#### 3.3.5 页面访问

- 初始化即上报 `page_view`：url、referrer、title、location、viewport、解析后的 UTM 与 `searchEngine`（基于 referrer 白名单：google / baidu / bing / duckduckgo / sogou / so.com / yahoo）。
- SPA 路由切换（`history.pushState` / `replaceState` / `popstate` / `hashchange`）自动上报。
- **Session 策略**：
  - 首次访问生成 `sessionId` 与 `sessionStart`，存 `localStorage`，键 `_ghc_session_<projectId>`。
  - 30 分钟无任何事件上报则标记过期，下一事件触发新 Session。
  - **跨标签页共享**：使用 `storage` 事件监听 `_ghc_session_*` 的变化，同域名多标签页共享同一 `sessionId`；不存在 `BroadcastChannel` 兼容风险时优先使用 `BroadcastChannel('ghc_session')` 推送。
  - 页面 `visibilitychange=hidden` 累加 session 活跃时长；`hidden` 超 30min 也视为过期。

#### 3.3.6 自定义上报

- `track(eventName, properties)` → `CustomEvent`。
- `time(name, duration, properties)` → `CustomMetric`。
- `log(level, msg, data)` → `CustomLog`。

#### 3.3.7 埋点（Tracking）

- **代码埋点**：`GHealClaw.track('btn_click', { productId })`。
- **全埋点**：`enableAutoTrack=true` 时，监听全局 `click`/`submit`/`change`，对含 `data-track` 属性的元素上报：事件名来自 `data-track-name`，属性来自 `data-track-*`。
- **曝光埋点**：`IntersectionObserver` 监听含 `data-track-expose` 的元素，首次进入视口且停留 ≥ 500ms 上报 `expose`。
- **停留时长**：页面 `visibilitychange` 切换间隔累计，上报 `page_duration`。

### 3.4 上报策略

| 场景 | 策略 |
|---|---|
| 普通批量 | `fetch(..., {keepalive: true})`，触发条件：达到 `maxBatchSize` 或 `flushInterval` |
| 页面离开 | `pagehide` / `beforeunload` 时优先 `navigator.sendBeacon`（**单次 ≤ 64KB**，超过拆批） |
| 不支持 fetch | 降级 `XMLHttpRequest` 异步 |
| 跨域被拦截 | 兜底 Image 请求（`new Image().src = url + '?payload=...'`，单条 ≤ 2KB） |
| 自动降级顺序 | `beacon` → `fetch` → `image` |

**Beacon 64KB 限制**：SDK 在序列化后检测大小，超限则先提取"必须送达"事件（error、session_end）用 Beacon 发送，其余回滚到 IndexedDB 队列待下次 flush。

**数据可靠性**：
- 发送失败的批次写入 `IndexedDB`（或 `localStorage` 兜底），SDK 启动时和 `online` 事件触发时重试，最多 3 次。
- 队列上限 500 事件，超量丢弃最旧。

### 3.5 采样与过滤

- 全局采样率优先，子类型采样率二次过滤。
- 采样决策在入队前完成，不占用上报配额。
- `ignoreErrors` / `ignoreUrls` 在 `beforeSend` 之前匹配；匹配命中直接丢弃。
- `beforeSend` 必须同步执行，返回 `null` 丢弃，返回新事件继续上报。

---

## 4. 数据模型（Event Payload）

所有事件共享公共字段 + 子类型字段，使用 Zod Schema 定义于 `packages/shared`。

### 4.1 公共字段

```typescript
interface BaseEvent {
  eventId: string;           // UUID v7
  projectId: string;         // 来自 DSN
  publicKey: string;
  timestamp: number;         // Unix ms
  type: EventType;           // 事件类型
  release?: string;
  environment?: string;
  sessionId: string;
  user?: { id: string; email?: string; name?: string };
  tags?: Record<string, string>;
  context?: Record<string, unknown>;
  device: {
    ua: string;
    os: string;
    osVersion?: string;
    browser: string;
    browserVersion?: string;
    deviceType: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
    screen: { width: number; height: number; dpr: number };
    network?: { effectiveType: string; rtt?: number; downlink?: number };
    language: string;
    timezone: string;
  };
  page: {
    url: string;              // 不含 hash 的完整 URL
    path: string;             // 归一化后的路径模板（如 /users/:id）
    referrer?: string;        // 上一页来源
    title?: string;
    utm?: {                   // 来源解析（仅在 URL 含 UTM 时填充）
      source?: string;
      medium?: string;
      campaign?: string;
      term?: string;
      content?: string;
    };
    searchEngine?: string;    // 基于 referrer 白名单识别：google/baidu/bing/...
    channel?: string;         // 业务方自定义渠道（query 参数 ch/channel）
  };
}
```

### 4.1.1 Breadcrumb 结构

所有 error / api / custom_log 事件可附带 `breadcrumbs: Breadcrumb[]`。

```typescript
interface Breadcrumb {
  timestamp: number;                       // Unix ms
  category: 'navigation' | 'click' | 'console' | 'xhr' | 'fetch' | 'ui' | 'custom';
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;                         // 简述
  data?: Record<string, unknown>;          // category 特定的结构化字段
}
```

容量：默认最多 100 条；超出采用 FIFO 淘汰。

### 4.2 事件子类型

| `type` | Payload 关键字段 |
|---|---|
| `error` | `subType: 'js' \| 'promise' \| 'resource' \| 'framework' \| 'white_screen'`、`message`、`stack`、`componentStack`、`resource?`、`breadcrumbs` |
| `performance` | `metric: 'LCP' \| 'FCP' \| 'CLS' \| 'INP' \| 'TTFB' \| 'FSP' \| 'FID' \| 'TTI' \| 'TBT' \| 'SI'`、`value`、`rating: 'good' \| 'needs-improvement' \| 'poor'`、`navigation?: NavigationTiming` |
| `long_task` | `duration`、`startTime`、`attribution`、`tier: 'long_task' \| 'jank' \| 'unresponsive'`（T2.1.8 落地；兼容旧事件默认 `long_task`） |
| `api` | `method`、`url`、`status`、`duration`、`requestSize`、`responseSize`、`traceId?`、`slow`、`failed`、`errorMessage?`、`requestBody?`（截断）、`responseBody?`（截断） |
| `resource` | `initiatorType`、`url`、`duration`、`transferSize`、`encodedSize`、`protocol`、`cache` |
| `page_view` | `enterAt`、`leaveAt?`、`duration?`、`loadType`、`isSpaNav` |
| `page_duration` | `startTime`、`endTime`、`activeMs` |
| `custom_event` | `name`、`properties` |
| `custom_metric` | `name`、`duration`、`properties?` |
| `custom_log` | `level`、`message`、`data?` |
| `track` | `trackType: 'click' \| 'expose' \| 'submit' \| 'code'`、`target`、`properties` |

**指纹规则（error）**：`sha1(subType + normalizedMessage + topFrame.fileBase + topFrame.function)`。

### 4.2.1 NavigationTiming（页面加载瀑布图数据）

**来源**：`performance.getEntriesByType('navigation')[0]` → `PerformanceNavigationTiming`（W3C Level 2）。
**附着**：SDK 仅在 `metric=TTFB` 事件的 `navigation` 字段上报一次（TTFB 本身即为 `responseStart - requestStart`，与瀑布强相关；选择单一载体避免重复传输）。
**采集时机**：`document.readyState === 'complete'` 时立即读，否则 `window.addEventListener('load', ..., { once: true })`。若 `loadEventEnd <= 0` 视为不完整瀑布，**返回 null 不上报**。

```typescript
interface NavigationTiming {
  dns: number;            // domainLookupEnd - domainLookupStart
  tcp: number;            // connectEnd - connectStart
  ssl?: number;           // connectEnd - secureConnectionStart；仅 secureConnectionStart > 0 时填充（https）
  request: number;        // responseStart - requestStart         （Time-to-First-Byte 核心分量）
  response: number;       // responseEnd - responseStart           （HTML 内容传输）
  domParse: number;       // domInteractive - responseEnd          （HTML 解析到可交互）
  domReady: number;       // domContentLoadedEventEnd - domContentLoadedEventStart  （DCL 事件自身耗时）
  resourceLoad: number;   // loadEventStart - domContentLoadedEventEnd              （子资源并行下载）
  total: number;          // loadEventEnd - startTime              （整体加载耗时）
  redirect?: number;      // redirectEnd - redirectStart；仅 redirectEnd > 0 时填充
  type: 'navigate' | 'reload' | 'back_forward' | 'prerender';  // 未知值防御映射为 'navigate'
}
```

**字段约束**：
- 所有阶段差值使用 `Math.max(0, a - b)` 防御浏览器 clock skew（避免负值破坏聚合）。
- `ssl` / `redirect` 在无 HTTPS / 无重定向时为 `undefined`（Zod `.optional()`），**不要写 0**——以便后端按 `IS NOT NULL` 筛除。
- `type` 遵循 W3C L2 的 `"navigate" | "reload" | "back_forward" | "prerender"`（注意 `back_forward` 是下划线，非旧浏览器的 `back-forward`）。

**前端展示（`LoadStageDto`）**：Dashboard 服务端对样本取各字段中位数后串接为 9 阶段瀑布（见 §5.5）：
- 串行阶段 7 个：`dns → tcp → ssl → request → response → domParse → resourceLoad`（cursor 累积 `startMs` / `endMs`）
- 整体指标 2 个（从 0 起）：`firstScreen`（当前用 FCP p75 近似，T2.1.2 FSP 落地后替换）/ `lcp`（LCP p75）

**后端聚合**：当前 T2.1.6 取样本中位数串接（见 §6.2）；T2.1.4 `metric_minute` 落地后按 `dim_key='stage'` × `dim_value ∈ {dns|tcp|ssl|request|response|domParse|domReady|resourceLoad}` 独立聚合。

---

## 5. HTTP API 契约

### 5.1 入口服务（Gateway）

| 路径 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/ingest/v1/events` | POST | 无（DSN 内联） | SDK 批量上报（JSON 或 `application/x-ndjson`） |
| `/ingest/v1/beacon` | POST | 无 | sendBeacon 入口，等价 events 但响应 204 |
| `/ingest/v1/envelope` | POST | 无 | 兼容 Sentry envelope 格式（未来扩展） |

**请求体**（events）：

```json
{
  "dsn": "https://<publicKey>@<host>/<projectId>",
  "sentAt": 1714195200000,
  "events": [ /* BaseEvent[] */ ]
}
```

**响应**：
- `200 OK` —`{ accepted, persisted, duplicates, enqueued }`：
  - `accepted` 本次上报事件总数
  - `persisted` 同步落库数（queue 模式下 error 事件为 0；sync/dual 模式累计所有同步路径）
  - `duplicates` Redis SETNX 命中的幂等去重数
  - `enqueued` 异步入队数（TM.E / ADR-0026；当前仅 `error` 事件在 `ERROR_PROCESSOR_MODE ∈ {queue, dual}` 时累计）
- `429 Too Many Requests` — 超出项目限流，返回 `Retry-After`。
- `400 Bad Request` — Schema 校验失败。
- `401 Unauthorized` — DSN 无效或项目已删除。

**限流**：按 `projectId` 令牌桶，默认 100 事件/秒（可配置）；采样率由服务端再次生效（`server_sample_rate`）。

### 5.2 Sourcemap 服务

| 路径 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/sourcemap/v1/releases` | POST | API Token | 创建 release |
| `/sourcemap/v1/releases/:release/artifacts` | POST | API Token | 上传 js + map（multipart） |
| `/sourcemap/v1/releases/:release/artifacts` | GET | JWT | 列表 |
| `/sourcemap/v1/releases/:release` | DELETE | API Token | 删除 release |

### 5.3 Dashboard API（`/api/v1` + `/dashboard/v1`）

`/api/v1` 为长期契约（JWT Bearer，T1.1.7 落地）；`/dashboard/v1` 为过渡期只读聚合（ADR-0015，鉴权待 T1.1.7 接入 `ProjectGuard`）。响应统一封装。

| 资源 | 路径 | 方法 |
|---|---|---|
| 认证 | `/api/v1/auth/login`、`/auth/refresh`、`/auth/me` | POST/POST/GET |
| 项目 | `/api/v1/projects`、`/projects/:id`、`/projects/:id/members` | CRUD |
| 环境 | `/api/v1/projects/:id/environments` | CRUD |
| Release | `/api/v1/projects/:id/releases` | CRUD |
| 异常 Issue | `/api/v1/projects/:id/issues`、`/issues/:id`、`/issues/:id/events` | GET/PATCH |
| 原始事件 | `/api/v1/projects/:id/events?type=...` | GET |
| **性能大盘（首版）** | **`/dashboard/v1/performance/overview`**（ADR-0015，见 §5.4.0） | GET |
| **异常大盘（首版）** | **`/dashboard/v1/errors/overview`**（ADR-0016，见 §5.4.0.1） | GET |
| **访问大盘（首版 · Tier 2.A）** | **`/dashboard/v1/visits/overview`**（ADR-0020 Tier 2.A；响应：summary {pv/uv/spaNavCount/reloadCount/spaNavRatio/reloadRatio/deltaPercent/deltaDirection} + trend[{hour,pv,uv}] + topPages[{path,pv,uv,sharePercent}] + topReferrers[{referrerHost,pv,sharePercent}]） | GET |
| **转化漏斗（Tier 2.D）** | **`/dashboard/v1/tracking/funnel`**（ADR-0027；Query：`projectId` 必填 · `steps` CSV 2~8 项 · `windowHours` 默认 24（1~168）· `stepWindowMinutes` 默认 60（1~1440）；响应：`windowHours / stepWindowMinutes / totalEntered / steps[{index,eventName,users,conversionFromPrev,conversionFromFirst}] / overallConversion` · 比例 4 位小数） | GET |
| 性能大盘（长期） | `/api/v1/projects/:id/performance/overview`、`/performance/web-vitals`、`/performance/apdex` | GET |
| API 分析 | `/api/v1/projects/:id/api/overview`、`/api/slow`、`/api/errors` | GET |
| 资源分析 | `/api/v1/projects/:id/resources/overview` | GET |
| 访问分析 | `/api/v1/projects/:id/visits/overview`、`/visits/top-pages`、`/visits/sessions/:id` | GET |
| 自定义事件 | `/api/v1/projects/:id/custom/events`、`/custom/metrics`、`/custom/logs` | GET |
| 告警规则 | `/api/v1/projects/:id/alert-rules`、`/alert-rules/:id` | CRUD |
| 告警历史 | `/api/v1/projects/:id/alert-history` | GET |
| 通知渠道 | `/api/v1/projects/:id/channels`、`/channels/:id` | CRUD |
| 自愈 | `/api/v1/issues/:id/heal`、`/heal/:jobId`、`/heal/:jobId/pr` | POST/GET/POST |

**响应格式**：

```typescript
// 成功
{ "data": T, "requestId": string }

// 分页
{ "data": T[], "pagination": { "page": number, "limit": number, "total": number }, "requestId": string }

// 错误
{ "error": string, "message": string, "details"?: unknown, "requestId": string }
```

### 5.4.0 Dashboard 性能大盘首版契约（ADR-0015）

**端点**：

```
GET /dashboard/v1/performance/overview
  ?projectId=<string>              必填
  &windowHours=<int>               可选，默认 24，范围 [1, 168]
  &limitSlowPages=<int>            可选，默认 10，范围 [1, 50]
```

**响应体**（`PerformanceOverviewDto`）：

```jsonc
{
  "data": {
    "vitals": [
      {
        "key": "LCP",                   // "LCP" | "FCP" | "CLS" | "INP" | "TTFB"
        "value": 2180,                  // CLS 保留 2 位小数，其余取整 ms
        "unit": "ms",                   // CLS 为 ""，其余为 "ms"
        "tone": "good",                 // "good" | "warn" | "destructive"（映射 §3.3.2 rating）
        "deltaPercent": 4.3,            // 与上一周期相比的绝对百分比，<0.1% 记 0
        "deltaDirection": "down",       // "up" | "down" | "flat"
        "sampleCount": 12843
      }
      // …始终返回 5 项：LCP / FCP / CLS / INP / TTFB
    ],
    "stages": [
      { "key": "dns",          "label": "DNS 查询",  "ms": 38,  "startMs": 0,    "endMs": 38 },
      { "key": "tcp",          "label": "TCP 连接",  "ms": 42,  "startMs": 38,   "endMs": 80 },
      { "key": "ssl",          "label": "SSL 建连",  "ms": 60,  "startMs": 80,   "endMs": 140 },
      { "key": "request",      "label": "请求响应",  "ms": 180, "startMs": 140,  "endMs": 320 },
      { "key": "response",     "label": "内容传输",  "ms": 96,  "startMs": 320,  "endMs": 416 },
      { "key": "domParse",     "label": "内容解析",  "ms": 240, "startMs": 416,  "endMs": 656 },
      { "key": "resourceLoad", "label": "资源加载",  "ms": 820, "startMs": 656,  "endMs": 1476 },
      { "key": "firstScreen",  "label": "首屏耗时",  "ms": 1380,"startMs": 0,    "endMs": 1380 },
      { "key": "lcp",          "label": "LCP",       "ms": 2180,"startMs": 0,    "endMs": 2180 }
    ],
    "trend": [
      { "hour": "2026-04-27T00:00:00.000Z", "lcpP75": 2100, "fcpP75": 1380, "inpP75": 170, "ttfbP75": 590,
        "fidP75": 0, "ttiP75": 0, "tbtP75": 220, "fmpP75": 1420, "siP75": 3120,
        "dnsP75": 38, "tcpP75": 42, "sslP75": 60, "contentDownloadP75": 96, "domParseP75": 240, "resourceLoadP75": 820, "sampleCount": 1284 }
    ],
    "slowPages": [
      { "url": "/checkout/review", "sampleCount": 842, "lcpP75Ms": 3820, "ttfbP75Ms": 1120, "bounceRate": 0 }
    ],
    "fmpPages": [
      { "url": "/home", "sampleCount": 3210, "fmpAvgMs": 1420, "fullyLoadedAvgMs": 2180, "within3sRatio": 0.92 }
    ],
    "dimensions": {
      "browser":  [{ "value": "Chrome",  "sampleCount": 8420, "sharePercent": 65.4, "fmpAvgMs": 1380 }],
      "os":       [{ "value": "Windows", "sampleCount": 6140, "sharePercent": 47.7, "fmpAvgMs": 1420 }],
      "platform": [{ "value": "desktop", "sampleCount": 9820, "sharePercent": 76.3, "fmpAvgMs": 1360 }]
    },
    "longTasks": {
      "count": 182,
      "totalMs": 18420,
      "p75Ms": 110,
      "tiers": { "longTask": 160, "jank": 20, "unresponsive": 2 }
    }
  }
}
```

**计算规则**：

| 字段 | 来源 | 公式 |
|---|---|---|
| `vitals[*].value` | `perf_events_raw` | `percentile_cont(0.75) WITHIN GROUP (ORDER BY value)`；按 `project_id + metric` 分组（含 LCP/FCP/CLS/INP/TTFB/FSP/FID/TTI/TBT/SI 共 10 项） |
| `vitals[*].sampleCount` | `perf_events_raw` | `COUNT(*)`；同窗口同 metric |
| `vitals[*].tone` | 服务端映射 | 阈值表同 §3.3.2；`≤ good → "good"` / `≤ needs-improvement → "warn"` / 其他 `"destructive"` |
| `vitals[*].deltaPercent` / `deltaDirection` | 当前窗口 vs 前一窗口 | `(current - previous) / previous × 100`；`abs(pct) < 0.1%` 或任一端为 0 时 `"flat"` |
| `stages[*].ms`（前 7 阶段） | Navigation 样本 | 取最近 N=200 条 `metric='TTFB' AND navigation IS NOT NULL` 的样本各字段**中位数**；`startMs/endMs` 串行 cursor 累积 |
| `stages.firstScreen.ms` | 当前用 FCP p75 近似 | T2.1.2 FSP 落地后切换为 FSP p75；从 0 起整体指标 |
| `stages.lcp.ms` | LCP p75 | 从 0 起整体指标 |
| `trend[*]` | `perf_events_raw` | `date_trunc('hour', to_timestamp(ts_ms/1000.0))` × `metric IN ('LCP','FCP','CLS','INP','TTFB','FID','TTI','TBT','FSP','SI')` 的 p75 宽表化；返回 UTC ISO，**前端用 dayjs 本地化** |
| `slowPages[*].lcpP75Ms` | `perf_events_raw` | `GROUP BY path` 后按 LCP p75 DESC 取 Top N |
| `slowPages[*].ttfbP75Ms` | 二次查询 | 对 Top N 的 `path` 集合聚合 TTFB p75 |
| `slowPages[*].bounceRate` | — | **本期恒为 0**；依赖 Phase 2.3 `VisitProcessor` |
| `fmpPages[*]` | `perf_events_raw` | `GROUP BY path WHERE metric='FSP'`；`fmpAvgMs=AVG(value)`、`fullyLoadedAvgMs` 近似 LCP avg（同 path）、`within3sRatio=COUNT(value<=3000)/COUNT(*)` |
| `dimensions.browser/os/platform` | `perf_events_raw` | `GROUP BY <device.browser \| device.os \| device.platform>` 取 Top-N，`sharePercent=count/total*100`、`fmpAvgMs` 同维度下 FSP 均值 |
| `longTasks.count/totalMs/p75Ms` | `perf_events_raw` | `WHERE type='long_task'` 的 `COUNT` / `SUM(lt_duration_ms)` / `percentile_cont(0.75)` |
| `longTasks.tiers` | `perf_events_raw` | 按 duration 桶：`longTask` 50~2000ms / `jank` 2000~5000ms / `unresponsive` ≥5000ms；旧事件无 tier 字段时按 duration 在服务端回填 |

**空数据降级**：
- `vitals` 始终返回 **9 项**（LCP/INP/CLS/TTFB/FCP/TTI/TBT/FID/SI，面板展示顺序）占位（`sampleCount=0` / `value=0` / `tone="good"` / `deltaDirection="flat"`）
- `stages` / `trend` / `slowPages` / `fmpPages` 为空数组
- `dimensions.{browser,os,platform}` 为空数组
- `longTasks` 为 `{ count: 0, totalMs: 0, p75Ms: 0, tiers: { longTask: 0, jank: 0, unresponsive: 0 } }`
- 前端据此渲染"暂无数据"，不抛错。

**索引命中**：`idx_perf_project_metric_ts`（Vitals / Trend / Waterfall）+ `idx_perf_project_path_ts`（SlowPages），现有索引覆盖全部查询路径。

**响应错误码**：
- `400 Bad Request` — query 参数 Zod 校验失败。
- `500 Internal Server Error` — DB 查询异常（不降级为空数据，避免掩盖后端故障）。

### 5.4.0.1 Dashboard 异常大盘首版契约（ADR-0016）

**端点**：

```
GET /dashboard/v1/errors/overview
  ?projectId=<string>              必填
  &windowHours=<int>               可选，默认 24，范围 [1, 168]
  &limitGroups=<int>               可选，默认 10，范围 [1, 50]
```

**响应体**（`ErrorOverviewDto`）：

```jsonc
{
  "data": {
    "summary": {
      "totalEvents": 128,
      "impactedSessions": 53,
      "deltaPercent": 12.4,
      "deltaDirection": "up"            // "up"（恶化） | "down"（改善） | "flat"
    },
    "bySubType": [
      { "subType": "js",           "count": 87, "ratio": 0.68 },
      { "subType": "promise",      "count": 24, "ratio": 0.19 },
      { "subType": "resource",     "count": 17, "ratio": 0.13 },
      { "subType": "framework",    "count":  0, "ratio": 0    },
      { "subType": "white_screen", "count":  0, "ratio": 0    }
    ],
    "trend": [
      {
        "hour": "2026-04-27T00:00:00.000Z",
        "total": 12, "js": 10, "promise": 2, "resource": 0,
        "framework": 0, "whiteScreen": 0
      }
    ],
    "topGroups": [
      {
        "subType": "js",
        "messageHead": "Cannot read properties of undefined (reading 'nickname')",
        "count": 54,
        "impactedSessions": 21,
        "firstSeen": "2026-04-27T03:10:12.000Z",
        "lastSeen": "2026-04-27T09:41:32.000Z",
        "sampleUrl": "/profile"
      }
    ]
  }
}
```

**计算规则**：

| 字段 | 来源 | 公式 |
|---|---|---|
| `summary.totalEvents` | `error_events_raw` | `COUNT(*)` |
| `summary.impactedSessions` | 同表 | `COUNT(DISTINCT session_id)` |
| `summary.deltaPercent` / `deltaDirection` | 当前窗口 vs 前一窗口 | `(current - previous) / previous × 100`；`abs(pct) < 0.1%` 或任一端为 0 时 `"flat"`；**up = 异常增加 = 恶化**（UI 红色） |
| `bySubType[*]` | `GROUP BY sub_type` | 缺失的 enum 值补零占位，始终返回 5 枚（`js` / `promise` / `resource` / `framework` / `white_screen`）；`ratio = count / totalEvents`，总和为 0 时 `ratio = 0` |
| `trend[*]` | `date_trunc('hour', to_timestamp(ts_ms/1000.0))` × `sub_type` | 宽表化为 `total` + 5 枚 subType 列；返回 UTC ISO，**前端用 dayjs 本地化**；空窗口返回 `[]` |
| `topGroups[*]` | `GROUP BY (sub_type, message_head)` 按 count DESC 限 `limitGroups` | `firstSeen` / `lastSeen` = `min/max ts_ms` → ISO；`sampleUrl` 从 `path` 聚合取任意一条 |

**空数据降级**：`summary.totalEvents = 0` 时 `bySubType` 补齐 5 枚占位；`trend` / `topGroups` 为空数组；前端 `SourceBadge` 展示 `empty` 态（"暂无异常"），不抛错。

**索引命中**：Summary 走 `idx_err_project_ts`；bySubType / trend 走 `idx_err_project_sub_ts`；topGroups 走 `idx_err_project_group_ts`，覆盖全部查询路径。

**响应错误码**：
- `400 Bad Request` — query 参数 Zod 校验失败。
- `500 Internal Server Error` — DB 查询异常（不降级为空数据，避免掩盖后端故障）。

### 5.4 开放 API

面向运维/数据平台，同 Dashboard API 契约，以 `API Token`（项目级）鉴权：
- `/open/v1/issues` — 拉取 Issue 列表。
- `/open/v1/metrics/query` — 按维度查询聚合指标。
- `/open/v1/events/stream` — SSE 推送实时事件（基础版）。
- `/open/v1/export` — 批量导出（异步任务 + 下载链接）。

**批量导出契约**：

```http
POST /open/v1/export
{ "dataset": "issues|events|metrics", "format": "csv|jsonl",
  "filter": { "from": "...", "to": "...", "environment": "..." } }
→ 202 { "jobId": "..." }

GET /open/v1/export/:jobId
→ 200 { "status": "pending|running|done|failed", "downloadUrl"?: string, "expiresAt"?: string }
```

导出文件落 S3，`downloadUrl` 为预签名 URL（默认 1 小时过期）。单任务最大 1000 万行；超限拒绝并提示窗口收窄。

---

## 6. 聚合与查询规则

### 6.1 Issue 聚合

- 新事件到达：计算指纹 → 查 `issues` 表 → 命中则 `count++`、更新 `last_seen`；未命中则新建 Issue。
- 每个 Issue 保留最近 N 条完整事件（N 默认 100）+ 长期统计计数。
- 冷事件（N+ 之外）仅保留精简元数据，原始数据归档到对象存储。

### 6.2 性能指标聚合

#### 6.2.1 长期方案：`metric_minute` 预聚合（T2.1.4 落地）

- 所有原始性能事件按 `project_id + metric + minute` 聚合至 `metric_minute` 表（p50/p75/p90/p95/p99、count、sum）。
- Apdex：每个项目独立配置 `apdexConfig = { metric: 'LCP' | 'FCP' | 'FSP' | 'customMetric', threshold: number }`。
  - 默认 `{ metric: 'LCP', threshold: 2500 }`（毫秒）。
  - 计算：满意 = `value ≤ T`、容忍 = `T < value ≤ 4T`、不满意 = `value > 4T`。
  - 每分钟计算一次，写入 `metric_minute`（metric=`apdex`）。
- 支持时间维度查询：`5m / 1h / 1d / 7d`，服务端选择合适的聚合粒度。

#### 6.2.2 过渡方案：`perf_events_raw` 直查 p75（T2.1.6 / ADR-0015）

未建 `metric_minute` 前，Dashboard 首版直查 `perf_events_raw`：

- **Vitals p75**：`percentile_cont(0.75) WITHIN GROUP (ORDER BY value)` × `GROUP BY metric`（LCP/FCP/CLS/INP/TTFB 全覆盖）。
- **环比 p75**：同查询在 `[now - 2w, now - w]` 再跑一次，得到 `deltaPercent`。
- **24h 趋势**：`date_trunc('hour', to_timestamp(ts_ms/1000.0))` × `metric IN ('LCP','FCP','INP','TTFB')` 的 p75，Node 层拼装为宽表（前端按本地时区格式化）。
- **瀑布样本**：取 `metric='TTFB' AND navigation IS NOT NULL` 最近 N=200 条 navigation JSONB，Node 层对每个字段取中位数。
- **慢页面 Top N**：两次查询（LCP p75 DESC 取 Top N `path` → 对 Top N `path` 查 TTFB p75），最终 `SlowPageDto`。

迁移锚点：T2.1.4 `metric_minute` 上线后，Controller 契约（§5.4.0）保持不变，Service 内部查询源切换为预聚合表。

### 6.3 地域 / 设备 / 网络 维度

- SDK 不上报 IP，入口由服务端解析 `CF-Connecting-IP`/`X-Forwarded-For` 查 IP 库（MaxMind/纯真）得国家/省/市。
- 聚合维度表：`project_id + metric + dim_key + dim_value + minute`。

**维度分阶段落地**：

| 维度 | 当前状态 | 落地时间 |
|---|---|---|
| `browser` / `os` / `platform` | 已在 T2.1.8 `PerformanceOverviewDto.dimensions` 中落地，走 `perf_events_raw.device_*` 列 GROUP BY | ✅ T2.1.8 |
| `deviceModel` / `deviceVendor` | `perf_events_raw` 尚无列，需 Schema 扩列 | Phase 2 后期 |
| `region` / `city` / `carrier` | 依赖 IP 库 + 服务端解析管线 | Phase 2.3（VisitProcessor） |
| `network.effectiveType` | 字段已在 BaseEvent 上报，聚合表未启用 | Phase 2.3 |

---

## 7. 告警引擎

### 7.1 告警规则 DSL

```typescript
interface AlertRule {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  target: 'error_rate' | 'api_success_rate' | 'web_vital' | 'issue_count' | 'custom_metric';
  filter?: { environment?: string; release?: string; tag?: Record<string, string> };
  condition: {
    aggregation: 'avg' | 'sum' | 'count' | 'p50' | 'p95' | 'p99' | 'rate';
    operator: '>' | '<' | '>=' | '<=' | '==';
    threshold: number;
    window: { durationMs: number; minSamples?: number };   // 窗口至少样本数防止噪声
  };
  severity: 'info' | 'warning' | 'critical';
  cooldownMs: number;          // 告警静默期
  channels: string[];          // 通知渠道 id
}
```

### 7.2 评估流程

- BullMQ `alert-evaluator` Worker 每分钟按规则查询聚合表。
- 命中则写 `alert_history`，状态机 `firing → resolved`；静默期内不再发送。
- 通知渠道支持：邮件（SMTP）、钉钉机器人、企业微信机器人、Slack Incoming Webhook、自定义 Webhook、**短信**（阿里云 / 腾讯云，通过 `SMS_PROVIDER` 切换）。
- 支持告警模板变量：`{{rule.name}}`、`{{metric.value}}`、`{{issue.url}}`、`{{project.name}}`、`{{environment}}`、`{{window}}`。

### 7.3 预置告警规则

项目创建时自动下发以下规则模板（`enabled=false`，用户启用后生效）：

| 名称 | 条件 | 严重度 |
|---|---|---|
| 错误率突增 | 过去 5 分钟 `error_rate` 相对前 1 小时均值 > 500%，且 error_rate > 5% | critical |
| JS 错误数激增 | 过去 5 分钟 `error` 计数 > 过去 24h 同窗口均值 × 3 | warning |
| 关键页面 LCP 劣化 | 过去 10 分钟特定页面 LCP p75 > 4000ms | warning |
| API 成功率下降 | 过去 5 分钟 `api_success_rate` < 95% | critical |
| 慢 API Top | 过去 10 分钟任一 API p95 > 3000ms | warning |
| 白屏事件出现 | 过去 5 分钟 `white_screen` 计数 ≥ 1 | critical |

用户可复制模板并调整阈值、环境过滤、通知渠道。

---

## 8. 自愈流程

### 8.1 触发方式

1. 用户在 Dashboard 点击 Issue 的「一键自愈」按钮 → 生成 `heal_job`。
2. 告警规则配置「自动自愈」→ 命中后自动派发 heal job。

### 8.2 Job 生命周期

```
pending → diagnosing → patching → verifying → pr_created
              ↓              ↓           ↓
           failed        failed       failed
```

| 阶段 | 职责 |
|---|---|
| diagnosing | LangChain Agent 调用 Tool：读 Issue → 读 Sourcemap 原始堆栈 → 读仓库关联文件 → 输出诊断 Markdown |
| patching | Agent 生成 diff patch |
| verifying | 在隔离的 Docker 沙箱 `git apply` + 运行项目测试命令（仓库配置 `heal.verify` 指定） |
| pr_created | 通过 GitHub/GitLab API 创建 PR，附诊断 Markdown + 受影响 Issue 链接 |

### 8.3 仓库配置（`.ghealclaw.yml`）

```yaml
repo:
  platform: github              # github | gitlab
  url: org/repo
  baseBranch: main
heal:
  enabled: true
  paths: ["src/**"]             # AI 可修改路径白名单
  forbidden: ["src/payment/**"] # 禁止修改路径
  verify: "pnpm lint && pnpm test"
  maxLoc: 100                   # 单次修改最大行数
  requireLabels: ["auto-heal"]  # PR 必贴标签
```

---

## 9. 数据模型（数据库 Schema）

核心表（Drizzle ORM，详见 `apps/server/src/shared/database/schema/`）：

### 9.1 已落地基线（ADR-0017，T1.1.5）

**主表 8 张 + 事件流 3 张；主表用前缀 nanoid（`proj_xxx` / `usr_xxx` 等），事件流用 bigserial**。

| 表 | 关键字段 | ID 类型 | 状态 |
|---|---|---|---|
| `users` | id, email, password_hash, display_name, role, is_active, last_login_at | `usr_xxx` | 已建表（T1.1.7 写入） |
| `projects` | id, slug, name, platform, owner_user_id, retention_days, is_active | `proj_xxx` | 已建表（T1.1.7 写入） |
| `project_keys` | id, project_id, public_key, secret_key, label, is_active, last_used_at | `pk_xxx` | 已建表（T1.3.2 鉴权） |
| `project_members` | project_id, user_id, role, invited_by, joined_at | 复合 PK | 已建表 |
| `environments` | project_id, name, description, is_production | 复合 PK | 已建表 |
| `releases` | id, project_id, version, commit_sha, notes | `rel_xxx` | 已建表（T1.5 Sourcemap 写入） |
| `issues` | id, project_id, fingerprint, sub_type, title, level, status, first_seen, last_seen, event_count, impacted_sessions, assigned_user_id | `iss_xxx` | **仅建表不写入**（ADR-0016 分组走 error_events_raw.message_head；T1.4.2 指纹落地后切换） |
| `perf_events_raw` | id, event_id, project_id, public_key, session_id, ts_ms, type, metric, value, rating, navigation(jsonb), ... | `bigserial` | 生产写入中（ADR-0013） |
| `error_events_raw` | id, event_id, project_id, public_key, session_id, ts_ms, sub_type, message, message_head, stack, frames(jsonb), breadcrumbs(jsonb) | `bigserial` | 生产写入中（ADR-0016） |
| `events_raw` | id, event_id, project_id, type, payload(jsonb), ingested_at（周分区） | 复合 PK | **父表 + 4 周分区已建，Gateway 暂不写入**（T1.4.1 完整 Processor 启用） |

**分区骨架**：`events_raw` 按 `ingested_at` 周分区，初始 4 张子表覆盖 2026-04-20 ~ 2026-05-18；分区维护脚本（滚动创建下周分区 + 归档历史分区）在 T1.4.1 落地。

**迁移源**：`apps/server/drizzle/0001_initial.sql` 手工维护 + `src/shared/database/ddl.ts` 的 `ALL_DDL` 双路径（详见 ARCHITECTURE §8.1.1）。

### 9.2 规划中表（MVP 后续）

| 表 | 用途 | 落地阶段 |
|---|---|---|
| `release_artifacts` | Sourcemap / 构建产物元数据 | T1.5 |
| `metric_minute` | 性能指标分钟粒度预聚合 | T2.1.4 |
| `sessions` | 会话聚合（页面数 / 错误数） | T2.2.x |
| `alert_rules` / `alert_history` | 告警规则与历史 | Phase 3 |
| `channels` | 通知渠道配置 | Phase 3 |
| `heal_jobs` | AI 自愈任务 | Phase 4 |

**保留策略**：
- `events_raw` 默认 30 天滚动删除（`projects.retention_days` 可项目级覆盖），冷数据归档至对象存储。
- `metric_minute` 保留 365 天（落地后启用）。

---

## 10. 权限与多租户

- 基于 `Project + Role`：`owner` / `admin` / `member` / `viewer`。
- Dashboard API 的所有资源路径必须经过 `ProjectGuard`，校验当前用户是否有该 `projectId` 访问权限。
- 开放 API 使用项目级 `API Token`，独立配额与失效策略。

---

## 11. 安全规则

- DSN `publicKey` 仅做项目识别，不含密钥，可暴露在前端。
- Sourcemap 上传使用 `secretKey` 或 API Token。
- SDK `beforeSend` 默认过滤常见 PII 字段名（password、token、authorization、cookie、secret）。
- 后端对 `requestBody`/`responseBody` 长度硬截断至 4KB；大字段禁止入库，超限转存对象存储并只保存引用。
- 所有 Dashboard 接口强制 HTTPS；JWT 过期 1h、Refresh Token 7d。

---

## 12. 兼容与多端

- **浏览器**：Chrome / Safari / Firefox / Edge 最新两个主版本；IE 11 降级（无性能观察器，只采集错误）。
- **小程序**：单独提供 `@g-heal-claw/miniapp-sdk`，复用 shared Schema，适配 `wx.request` / `my.request` 劫持。
- **移动端 Hybrid**：通过 H5 SDK，注入 `deviceType=mobile` 标签即可。
- **多环境**：`environment` 字段是所有查询的第一分区维度，严禁跨环境聚合污染。

---

## 13. 性能与容量目标

| 指标 | 目标 | 测量方式 |
|---|---|---|
| Gateway 单节点吞吐 | ≥ 5000 events/s | k6 压测，p95 响应 < 50ms |
| 端到端事件延迟（入库） | p95 < 2s | `ingested_at - timestamp` 直方图 |
| Issue 聚合延迟 | p95 < 5s | `issue.last_seen - event.timestamp` |
| 性能大盘查询延迟 | p95 < 1s | Dashboard API `/performance/*` |
| Dashboard 首屏 | LCP < 1.5s | 自家 SDK dogfooding |
| SDK 体积 | 核心 < 15KB gzip | CI Bundle size gate |
| SDK 运行时开销 | CPU < 2% | **宿主 Long Task 占比**：SDK 内置自测模式，`requestAnimationFrame` 监测每秒 long task 累计时长，启用 `debug=true` 时打印 |
| SDK 首屏阻塞 | < 50ms | 性能插件 `requestIdleCallback` 初始化，主线程占用 ≤ 50ms |

详细容量规划与压测方案见 `DESIGN.md`。
