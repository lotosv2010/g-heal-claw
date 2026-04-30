# 页面访问采集（PageView）

`pageViewPlugin` 采集两类访问事件，驱动后台 **监控中心 → 页面访问** `/monitor/visits`：

- **硬刷新 / 首次进入**：`loadType` = `navigate` / `reload` / `back_forward` / `prerender`（读自 Performance Navigation API）
- **SPA 路由切换**：monkey-patch `history.pushState` / `history.replaceState` + 监听 `popstate`

上报事件 `type = 'page_view'`，落库到 `page_view_raw` 表（ADR-0020 Tier 2.A）。

## 最小接入

```ts
import {
  init,
  pageViewPlugin,
} from "@g-heal-claw/sdk";

init(
  { dsn: "http://pk_xxx@your-server:3001/proj_demo" },
  {
    plugins: [
      pageViewPlugin(), // 默认：enabled=true, autoSpa=true
    ],
  },
);
```

## 配置项

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | `boolean` | `true` | 关闭后完全不采集 |
| `autoSpa` | `boolean` | `true` | `false` 时只采首次加载，不 patch history |

```ts
pageViewPlugin({
  enabled: true,
  autoSpa: true,
});
```

## 设计约束

- **SSR 降级**：非浏览器环境（无 `window` / `document`）直接跳过
- **幂等 patch**：重复 `setup` 不会重复 wrap `pushState/replaceState`（`__ghcPageViewPatched` 标记）
- **去重**：同 URL 连续派发会被合并（避免 replaceState 刷 URL 时重复上报）
- **零阻塞**：所有事件通过 `hub.transport.send` 异步发送，失败吞错

## 与其他插件的分工

| 插件 | 采集内容 | 后台入口 |
|---|---|---|
| `pageViewPlugin` | 页面进入（PV/UV） | 监控 → 页面访问 |
| `trackPlugin` | 交互埋点（click / submit / expose / code） | 埋点分析 → 事件分析 |
| `performancePlugin` | Web Vitals + Navigation Timing | 监控 → 页面性能 |

## 验证路径

1. `pnpm dev:demo` 启动本地 demo → 访问 `/visits/page-view`
2. DevTools → Network → 过滤 `/ingest/v1/events`，观察载荷 `type: "page_view"`
3. 后台 `/monitor/visits` 查看 PV / UV / SPA 占比 / 刷新占比 / TopPages / TopReferrers

## 相关文档

- 后台用法：[监控 · 页面访问](/guide/visits)
- 指标口径：[访问分析指标](/reference/visits-metrics)
- 架构决策：ADR-0020 Tier 2.A
