# ADR-0014: SDK PerformancePlugin — Core Web Vitals + Navigation Timing 上报

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-27 |
| 决策人 | @gaowenbin |
| 关联任务 | T2.1.1（SDK PerformancePlugin） |

## 背景

PRD §2.1 要求 SDK 采集 Core Web Vitals 与页面加载瀑布图：

- Core Web Vitals：LCP ≤ 2.5s / FCP ≤ 1.8s / CLS ≤ 0.1 / INP ≤ 100ms / TTFB ≤ 200ms
- 页面加载阶段：DNS / TCP / SSL / 请求 / 响应 / DOM / 资源（来自 `PerformanceNavigationTiming`）

SPEC §3.3.2 已指定采集技术路径（`PerformanceObserver` + `navigation.responseStart - requestStart`），并约定 LCP/INP/CLS 在 `visibilitychange=hidden` / `pagehide` 上报**最终值**。

`packages/shared/src/events/performance.ts` 已定义 `PerformanceEventSchema`：

```ts
PerformanceEventSchema = BaseEventSchema.extend({
  type: z.literal("performance"),
  metric: z.enum(["LCP", "FCP", "CLS", "INP", "TTFB", "FSP"]),
  value: z.number().nonnegative(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  navigation: NavigationTimingSchema.optional(),
});
```

`NavigationTimingSchema` 字段齐备（dns / tcp / ssl? / request / response / domParse / domReady / resourceLoad / total / redirect? / type）。

ADR-0010 已锁 SDK 骨架边界，Plugin 接口（`{ name, setup(hub, options) }`）与 `FetchTransport` 单事件 POST 已就绪。

**本 ADR 解决**：如何在 SDK 骨架之上落地 `PerformancePlugin`，既符合 W3C 规范与浏览器兼容性现实，又不违反体积预算（≤ 15KB gzip）。

## 决策

### 1. 采集策略：引入 `web-vitals@^4` 依赖

**核心 5 个 Web Vitals 交由 `web-vitals` 库统一采集**，Navigation 瀑布 SDK 自采：

| 指标 | 采集方式 |
|---|---|
| LCP | `onLCP(cb, { reportAllChanges: false })` — 仅最终值 |
| FCP | `onFCP(cb)` |
| CLS | `onCLS(cb)` |
| INP | `onINP(cb)` |
| TTFB | `onTTFB(cb)` |
| Navigation 瀑布 | `load` 事件后读 `performance.getEntriesByType('navigation')[0]` |

**为什么选 `web-vitals` 而不是自研**：

1. Google Chrome 团队官方实现，体积 gzip ≈ 1.5KB（占 15KB 预算 10%）
2. INP / CLS 的"最终值"上报时机内置（`pagehide` / `visibilitychange=hidden` 已处理）
3. Safari / Firefox 差异（INP 仅 Chrome 121+）内置特性检测
4. 自研需持续跟踪 W3C 规范与各浏览器 bug，维护成本远超 1.5KB 的体积节省
5. 后续若在 T1.2.8 体积预算 Gate 发现触顶，可平滑切换自研（接口已抽象）

### 2. 插件结构

文件：`packages/sdk/src/plugins/performance.ts`

```ts
export interface PerformancePluginOptions {
  /** 是否上报 Navigation 瀑布（默认 true） */
  readonly reportNavigation?: boolean;
  /** 是否在 setup 时立即上报已触发的 Web Vital（默认 true） */
  readonly reportAllChanges?: boolean;
}

export function performancePlugin(
  opts: PerformancePluginOptions = {},
): Plugin;
```

Plugin `setup(hub)` 内：

1. **特性检测**：`typeof PerformanceObserver === 'undefined'` → 记 warn 并 return（SSR / 旧浏览器降级）
2. **Web Vitals 订阅**：`onLCP/onFCP/onCLS/onINP/onTTFB`，回调中构造 `PerformanceEvent` → `hub.transport.send`
3. **Navigation 采集**：
   - `document.readyState === 'complete'` → 立即采集
   - 否则监听 `window.addEventListener('load', collectNavigation, { once: true })`
4. **事件构造**：调用 `createBaseEvent(hub, 'performance')` → 展开 `{ type: 'performance', metric, value, rating, navigation? }`

### 3. Rating 阈值

`web-vitals` 的 `Metric.rating` 已按 Google 官方阈值返回 `'good' | 'needs-improvement' | 'poor'`，与 `PerformanceEventSchema.rating` 枚举一致，**直接透传不自定义**：

| 指标 | good | needs-improvement | poor |
|---|---|---|---|
| LCP | ≤ 2500ms | ≤ 4000ms | > 4000ms |
| FCP | ≤ 1800ms | ≤ 3000ms | > 3000ms |
| CLS | ≤ 0.1 | ≤ 0.25 | > 0.25 |
| INP | ≤ 200ms | ≤ 500ms | > 500ms |
| TTFB | ≤ 800ms | ≤ 1800ms | > 1800ms |

> 注：PRD §2.1 标注的 INP ≤ 100ms / TTFB ≤ 200ms 为**仪表盘默认阈值**（可配置），采集侧遵循 Google Web Vitals 标准阈值即可；两者不冲突。

### 4. Navigation 瀑布映射

`PerformanceNavigationTiming`（W3C Level 2）→ `NavigationTimingSchema`：

```ts
const t = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
{
  dns: t.domainLookupEnd - t.domainLookupStart,
  tcp: t.connectEnd - t.connectStart,
  ssl: t.secureConnectionStart > 0 ? t.connectEnd - t.secureConnectionStart : undefined,
  request: t.responseStart - t.requestStart,
  response: t.responseEnd - t.responseStart,
  domParse: t.domInteractive - t.responseEnd,
  domReady: t.domContentLoadedEventEnd - t.domContentLoadedEventStart,
  resourceLoad: t.loadEventStart - t.domContentLoadedEventEnd,
  total: t.loadEventEnd - t.startTime,
  redirect: t.redirectEnd > 0 ? t.redirectEnd - t.redirectStart : undefined,
  type: mapNavigationType(t.type), // 'navigate' | 'reload' | 'back_forward' | 'prerender'
}
```

**Navigation 事件独立上报**（不内嵌到 Web Vital 事件），单独一条 `type=performance, metric=TTFB, navigation={...}`：

- 选择 TTFB 载体是因为 TTFB 本身来自 `navigation.responseStart - requestStart`，与瀑布强相关
- 另一种方案是新增 `metric=NAV` 枚举，但会动 shared Schema（contract 变更成本高）
- 后端聚合 `metric_minute` 时通过 `navigation?.type` 判定是否是瀑布数据

### 5. 公开 API 与导出

`packages/sdk/src/index.ts` 新增：

```ts
export { performancePlugin } from "./plugins/performance.js";
export type { PerformancePluginOptions } from "./plugins/performance.js";
```

用法：

```ts
import { init, performancePlugin } from "@g-heal-claw/sdk";

init({ dsn: "..." }, { plugins: [performancePlugin()] });
```

### 6. 体积预算

| 项 | 体积 (gzip) |
|---|---|
| 当前骨架 | 2.73 KB |
| `web-vitals@^4` | ~1.5 KB |
| PerformancePlugin 自身代码 | ~0.5 KB |
| **合计** | **~4.7 KB** / 15 KB 预算 |

### 7. 测试策略

- **单元测试**：`performance.test.ts` — mock `web-vitals` 导出（`vi.mock('web-vitals')`），断言：
  - 订阅了 5 个 Vitals 回调
  - 回调触发后 `hub.transport.send` 被调用 + 事件 Schema `safeParse` 通过
  - `PerformanceObserver` 不可用时静默降级
- **Navigation 映射测试**：构造 fake `PerformanceNavigationTiming` 对象验证字段映射
- **集成验证**：`examples/nextjs-demo` 注册 plugin，浏览器 DevTools Network 观测到 5+1 条 POST

## 备选方案

### A. 引入 `web-vitals` 库 + SDK 自采 Navigation（**采纳**）

- ✅ 官方实现覆盖浏览器差异、最终值上报、边缘 case（BFCache / 隐藏标签页）
- ✅ 体积 ≤ 5KB gzip，远低于预算
- ✅ 接口抽象后切换自研成本低
- ❌ 多一个外部依赖（但 Google 官方长期维护）

### B. 自研 PerformanceObserver 实现（原计划）

- ✅ 零依赖
- ❌ 需跟踪 W3C 规范变更 + 各浏览器 bug 列表（Chromium INP 实现就迭代了 3 次）
- ❌ `pagehide` / `visibilitychange=hidden` + BFCache 逻辑自研易出 bug
- ❌ INP 需要 `interactionId` 聚合，自研复杂度高
- 🔁 留作 T1.2.8 体积预算 Gate 触顶后的备选

### C. 使用 `web-vitals/attribution` 包

- ✅ 返回 LCP/INP 的归因信息（哪个元素、哪次交互）
- ❌ 体积翻倍（gzip ≈ 3.5KB），本期用不到归因（Phase 2 后续再评估）

### D. 所有指标打包成一条事件上报

- ❌ 违反 `type=performance, metric=<single>` 的事件契约
- ❌ LCP/INP/CLS 最终值在 `pagehide` 才上报，与 FCP/TTFB 首次可用即报时机冲突
- ❌ 后端聚合按 `metric` 分组，单事件单指标对齐自然

## 影响

### 正向

- **PRD §2.1 Core Web Vitals 全覆盖**，Navigation 瀑布可驱动性能大盘真实数据（替换 `apps/web` mock fixture）
- **低风险高覆盖**：`web-vitals` 在 Sentry / DataDog / New Relic 等商业监控 SDK 中广泛使用
- **向后兼容**：Plugin 接口不变，后续切换自研时调用方零感知

### 负向 / 成本

- SDK 新增 `web-vitals@^4` 依赖（+1.5KB gzip）
- 需要在 `apps/web/performance` 页面后续（T1.6/T2.1.7）切换数据源从 fixture → 真实 API

### 对现有契约的改动

- **SPEC.md**：无改动（§3.3.2 已涵盖采集方式；§4.2 `PerformanceEventSchema` 已定义）
- **ARCHITECTURE.md**：无改动
- **shared/events/performance.ts**：无改动（直接复用）
- **sdk package.json**：新增 `web-vitals` 运行时依赖
- **sdk/src/index.ts**：新增导出 `performancePlugin` + `PerformancePluginOptions`

## 后续

- T2.1.1.1 ~ T2.1.1.N 按本 ADR 拆解落地（见 `docs/tasks/CURRENT.md`）
- T2.1.2 首屏时间（FSP）作为独立指标在 PerformancePlugin 上扩展 `metric=FSP`
- T2.1.3 长任务 / 卡顿 / 无响应作为独立插件 `longTaskPlugin`（或并入 PerformancePlugin 可选开关，届时评估）
- T2.1.4 后端 PerformanceProcessor 消费 `type=performance` 事件 → `metric_minute` 聚合
- T1.2.8 SDK 体积预算 CI Gate 触顶时评估切换自研（备选 B）
