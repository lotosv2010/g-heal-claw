# 设备与页面上下文

SDK 在**每次事件上报**时自动采集设备和页面上下文，无需额外配置。

## 采集字段

### device（设备信息）

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `ua` | `string` | 完整 User-Agent 字符串 | `Mozilla/5.0 ...` |
| `browser` | `string` | 浏览器名称 | `Chrome` / `Safari` / `Firefox` / `Edge` |
| `browserVersion` | `string?` | 浏览器主版本号 | `125.0.6422.60` |
| `os` | `string` | 操作系统 | `Windows` / `macOS` / `Android` / `iOS` |
| `osVersion` | `string?` | 操作系统版本 | `10.0` / `15.4` |
| `deviceType` | `enum` | 设备类型 | `desktop` / `mobile` / `tablet` / `bot` / `unknown` |
| `screen.width` | `number` | 屏幕宽度（px） | `1920` |
| `screen.height` | `number` | 屏幕高度（px） | `1080` |
| `screen.dpr` | `number` | 设备像素比 | `2` |
| `network.effectiveType` | `string?` | 网络类型 | `4g` / `3g` / `2g` / `slow-2g` |
| `network.rtt` | `number?` | 往返时延估算（ms） | `50` |
| `network.downlink` | `number?` | 下行带宽估算（Mbps） | `10` |
| `language` | `string` | 浏览器语言 | `zh-CN` |
| `timezone` | `string` | 时区 | `Asia/Shanghai` |

### page（页面信息）

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `url` | `string` | 当前完整 URL（不含 hash） | `https://example.com/dashboard?tab=perf` |
| `path` | `string` | pathname | `/dashboard` |
| `referrer` | `string?` | 来源页面 | `https://google.com` |
| `title` | `string?` | 页面标题 | `性能监控 - G-Heal-Claw` |

## 浏览器检测顺序

SDK 使用轻量正则匹配（零外部依赖），检测顺序：

1. **Edge** — UA 含 `Edg/`（优先于 Chrome，因 Edge UA 同时含 `Chrome`）
2. **Opera** — UA 含 `OPR/` 或 `Opera`
3. **Firefox** — UA 含 `Firefox/`
4. **SamsungBrowser** — UA 含 `SamsungBrowser/`
5. **IE** — UA 含 `MSIE` 或 `Trident/`
6. **Chrome** — UA 含 `Chrome/`（优先于 Safari，因 Chrome UA 同时含 `Safari`）
7. **Safari** — UA 含 `Safari/`

> 精细化 UA 解析（ua-parser-js / Client Hints）计划在后续版本升级。

## Network Information API

`network` 字段依赖浏览器 [Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation)：

| 浏览器 | 支持情况 |
|--------|---------|
| Chrome / Edge / Opera / Samsung | ✅ 支持 |
| Firefox | ❌ 不支持 |
| Safari | ❌ 不支持 |

不支持的浏览器中 `network` 字段为 `undefined`，不影响其他字段采集。

## SSR 兼容

在服务端渲染环境（Node.js / jsdom）中：

- `navigator` 不存在时返回安全默认值（`ua: "unknown"`, `deviceType: "unknown"`）
- `window` / `screen` 不存在时 screen 维度为 `0`，dpr 为 `1`
- `Intl` 不存在时 timezone 降级为 `"UTC"`

## 配置

设备上下文采集为内置行为，**无需手动配置或注册插件**。如需关闭（极少见场景）：

```ts
import { init } from "@g-heal-claw/sdk";

init({
  dsn: "...",
  // 通过 beforeSend 移除 device 字段
  beforeSend(event) {
    delete event.device;
    return event;
  },
});
```

## 在 Dashboard 中查看

设备维度数据在以下页面展示：

- **监控中心 → 页面性能** — 底部「维度分布」Tab（浏览器 / OS / 平台）
- **监控中心 → 页面访问** — 设备分布统计
- **告警规则** — 可按 `device.browser` / `device.os` 配置过滤条件

## Demo

→ [设备上下文 Demo](/perf/device-context)（`examples/nextjs-demo`，`pnpm dev:demo` 启动后访问）
