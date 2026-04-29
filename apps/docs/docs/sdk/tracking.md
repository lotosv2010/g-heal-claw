# 埋点上报

`trackPlugin` 提供 4 类埋点事件采集，统一以 `type: 'track'` 上报 Gateway → `track_events_raw` 表，驱动后台「埋点分析 → 事件分析」大盘。

## 启用插件

```ts
import { init, trackPlugin } from "@g-heal-claw/sdk";

init(
  { dsn: "https://<publicKey>@<host>/<projectId>" },
  {
    plugins: [
      trackPlugin({
        captureClick: true,      // data-track / data-track-id 点击（默认 true）
        captureSubmit: true,     // 表单 submit（默认 true）
        captureExpose: true,     // 元素曝光（默认 true）
        exposeDwellMs: 500,      // 曝光所需停留毫秒（默认 500）
        throttleMs: 1000,        // 同 selector 节流窗口（默认 1000）
      }),
    ],
  },
);
```

## 4 类埋点事件

### 1. Click 全埋点

在 DOM 节点上标记 `data-track` 或 `data-track-id`：

```html
<button data-track-id="checkout_submit" data-track-order="o-123">立即购买</button>
<a data-track="nav_home">首页</a>
```

插件走 `document` capture 阶段监听 click；从目标节点向上查找带 `data-track` / `data-track-id` 的祖先，命中即上报。未打标的节点被忽略以避免噪声。

### 2. Submit 全埋点

任意 `<form>` 提交都会自动上报。建议给 form 加 `data-track-id` 以提升可读性：

```html
<form data-track-id="signup_form">...</form>
```

### 3. Expose 曝光

给需要统计曝光的元素加 `data-track-expose`：

```html
<div data-track-expose data-track-id="promo_hero" data-track-module="home">
  ...
</div>
```

插件使用 `IntersectionObserver`（threshold 0.5）+ `exposeDwellMs` 停留判定，停留达标后上报一次（同一元素不重复上报）。页面动态插入的节点通过 `MutationObserver` 自动接管。

### 4. Code 代码埋点

```ts
import { track } from "@g-heal-claw/sdk";

track("checkout_submit", {
  orderId: "o-123",
  amount: 99.9,
  currency: "CNY",
});
```

或通过 UMD 命名空间调用：`GHealClaw.track(name, props)`。

事件名建议 `<domain>_<action>` 命名：

| 推荐 | 不推荐 |
|---|---|
| `checkout_submit` | `clickButton1` |
| `login_success` | `login` |
| `video_play_start` | `playVideo` |

## data-track-\* 属性映射 properties

所有以 `data-track-*` 为前缀的 dataset 属性（除 `data-track` / `data-track-id`）都会被自动采集到 `properties` 字段：

```html
<button data-track-id="product_card" data-track-product="p-1" data-track-price="99.9">
  ...
</button>
```

上报的 `properties` 将包含：`{ product: "p-1", price: "99.9" }`（值保持字符串原样，必要时在消费端解析）。

## 设计约束

- **SSR 降级**：非浏览器环境跳过，不抛错
- **零阻塞**：所有事件通过 `hub.transport.send` 异步吞错，不影响主流程
- **幂等挂载**：重复 `setup` 不会重复绑定监听
- **默认节流**：click / submit 同 selector 1s 内最多上报一次，避免连击误触

## 事件载荷（TrackEvent）

上报到 Gateway 的事件结构（`@g-heal-claw/shared` `TrackEventSchema`）：

```ts
{
  type: "track",
  trackType: "click" | "submit" | "expose" | "code",
  target: {
    tag?: string,          // 如 "button"、"form"
    id?: string,           // 元素 id
    className?: string,
    selector: string,      // 插件计算的稳定选择器（优先 data-track-id）
    text?: string,         // 元素文本，≤200 字符
  },
  properties: Record<string, unknown>,
  // 基础字段：projectId / publicKey / sessionId / tsMs / pageUrl / ...
}
```

`selector` 的回退顺序：`data-track-id` → `data-track` → `#id` → `tag.className` → `tag`。

## properties 自动映射规则

所有 `data-track-*` 前缀的 dataset（排除 `data-track` / `data-track-id`）会被自动采集：

| HTML | properties |
|---|---|
| `data-track-product="p-1"` | `{ product: "p-1" }` |
| `data-track-price="99.9"` | `{ price: "99.9" }` |
| `data-track-cta-type="primary"` | `{ ctaType: "primary" }`（自动 camelCase） |

> dataset 值永远是字符串，数值/布尔请在消费端解析。

## Code 埋点事件名归一化

`track(name, props)` 上报时会自动把事件名写入 `properties.__name`，后端聚合时据此区分 code 埋点内的不同事件名：

```ts
track("checkout_submit", { amount: 99.9 });
// => properties: { amount: 99.9, __name: "checkout_submit" }
```

空字符串 name 会被静默丢弃，未 `init` 时调用也会静默降级。

## Demo 场景（快速体验）

在 `examples/nextjs-demo` 启动后访问以下路由（见 `examples/nextjs-demo/app/demo-scenarios.ts`）：

| 路由 | 演示点 |
|---|---|
| `/tracking/click` | 祖先监听 / 简写 / 节流 / 未标注对照 |
| `/tracking/submit` | 表单打标 vs 未打标 · selector 回退 |
| `/tracking/expose` | IntersectionObserver + 停留判定 + MutationObserver 动态追加 |
| `/tracking/code` | `track(...)` + `GHealClaw.track(...)` 两种调用形态 |
| `/tracking/playground` | 一页速查 4 类事件 |

## 常见问题

**Q：data-track-id 和 data-track 有什么区别？**
A：语义相同，都能触发 click 采集；`data-track-id` 更显式，`data-track` 是简写。selector 优先取 `data-track-id`。

**Q：为什么未标注的按钮点击没有上报？**
A：设计选择 — 避免噪声。click 全埋点默认只采集<b>显式打标</b>的节点，未打标节点不进入事件流。

**Q：同一个曝光卡在页面内反复滚入滚出，会重复上报吗？**
A：不会。插件用 `WeakSet` 记录已上报节点，同一节点只上报一次。

**Q：input 的值为什么没自动进 properties？**
A：安全考虑，插件从不读 input.value。请通过 `data-track-*` 主动暴露必要字段（并做好脱敏）。

**Q：SPA 路由切换后动态渲染的 `[data-track-expose]` 节点会被监听吗？**
A：会。插件对 `document.body` 开启 `MutationObserver`，新增的 `[data-track-expose]` 节点自动接管。
