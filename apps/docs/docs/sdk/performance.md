# 性能监控

`performancePlugin` **默认启用**。

## 自动采集

| 指标 | 来源 |
|---|---|
| **LCP** | `PerformanceObserver('largest-contentful-paint')` |
| **INP** | `PerformanceEventTiming` |
| **CLS** | `PerformanceObserver('layout-shift')` |
| **FCP** | `PerformancePaintTiming` |
| **TTFB** | Navigation Timing |
| **Long Task** | `PerformanceObserver('longtask')` |
| **Navigation Timing** | 包含 DNS / TCP / SSL / TTFB / DOM / Load 全阶段 |
| **Resource Timing** | 每个资源的加载耗时 |

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
