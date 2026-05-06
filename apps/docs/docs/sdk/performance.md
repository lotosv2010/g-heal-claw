# 性能监控

`performancePlugin` **默认启用**。

## 自动采集

| 指标 | 来源 | 说明 |
|---|---|---|
| **LCP** | `PerformanceObserver('largest-contentful-paint')` | Core Web Vital，最大内容绘制 |
| **INP** | `PerformanceEventTiming` | Core Web Vital，交互响应延迟 |
| **CLS** | `PerformanceObserver('layout-shift')` | Core Web Vital，累计布局偏移 |
| **FCP** | `PerformancePaintTiming` | Core Web Vital，首次内容绘制 |
| **TTFB** | Navigation Timing | Core Web Vital，首字节时间 |
| **Long Task** | `PerformanceObserver('longtask')` | ≥50ms 主线程阻塞，三级分类（long_task / jank / unresponsive） |
| **SI** | `speedIndexPlugin` FP/FCP/LCP 三里程碑法 | 视觉填充速度近似（±20%），需额外注册插件 |
| **Navigation Timing** | 包含 DNS / TCP / SSL / TTFB / DOM / Load 全阶段 | 页面加载瀑布图数据源 |
| **Resource Timing** | 每个资源的加载耗时 | 资源监控数据源 |

## 服务端推导指标

| 指标 | 计算方式 | 说明 |
|---|---|---|
| **TBT** | `Σ max(0, longTaskDuration − 50ms)` | 总阻塞时间，从 Long Task 原始数据聚合 |

## 已废弃指标

| 指标 | 废弃原因 | 替代 |
|---|---|---|
| **FID** | 仅衡量首次交互的 input delay，代表性差 | INP（覆盖全会话所有交互） |
| **TTI** | 5s 静默窗口判定不稳定，polyfill 停止维护 | INP + TBT 组合 |

> FID / TTI 不再采集新数据，Dashboard 对历史数据展示 `Deprecated` Badge。详见 [性能指标参考](/reference/performance-metrics)。

## 自定义 FMP（首次有意义绘制）

业务方可以标记 FMP：

```ts
import { markFMP } from "@g-heal-claw/sdk";

// 首屏关键内容渲染完成时调用
requestAnimationFrame(() => markFMP());
```

## Long Task 过滤

默认上报 ≥ 50ms 的 Long Task。可调整：

```ts
init({
  plugins: [
    performancePlugin({
      longTaskThreshold: 100,  // 毫秒
    }),
  ],
});
```

## 单页应用（SPA）路由切换

SDK 监听 `history.pushState` / `popstate`，自动标记新页面的性能起点。`page_view` 事件中的 `pathname` 会自动带上新路由。

如果使用 Hash 路由，需开启：

```ts
performancePlugin({ hashRouter: true });
```

## 查看数据

→ 监控中心 / [页面性能](/guide/performance)
