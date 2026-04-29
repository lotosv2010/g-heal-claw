# 埋点上报

> `trackPlugin` 建设中（P0-3 里程碑）。本页描述目标 API。

## 代码埋点

```ts
import { track } from "@g-heal-claw/sdk";

track("checkout_submit", {
  orderId: "o-123",
  amount: 99.9,
  currency: "CNY",
});
```

事件名建议 `<domain>_<action>` 命名：

| 好 | 差 |
|---|---|
| `checkout_submit` | `clickButton1` |
| `login_success` | `login` |
| `video_play_start` | `playVideo` |

## 曝光埋点

```ts
import { exposure } from "@g-heal-claw/sdk";

// 元素进入视口 50% 即上报
exposure(".product-card", {
  threshold: 0.5,
  once: true,
  propsFrom: (el) => ({
    productId: el.dataset.productId,
  }),
});
```

## 自定义指标 / 日志

```ts
import { customMetric, customLog } from "@g-heal-claw/sdk";

customMetric("cart_items_count", 3);
customMetric("page_score", 87.5, { tags: { pageType: "home" } });

customLog("user opened settings", {
  level: "info",
  extra: { tab: "notifications" },
});
```

## 声明式埋点（HTML 属性）

在 DOM 节点上标记 `data-track`：

```html
<button data-track="buy_now" data-track-props='{"productId":"p-1"}'>
  立即购买
</button>
```

SDK 自动委托监听 `click` / `submit` 事件触发上报。

## 批量上报

所有埋点事件会在 **1 秒窗口内合并** 为一个 HTTP 请求上报，降低网络开销。
