# 异常监控

`errorPlugin` **默认启用**，无需手动引入。

## 自动采集

| 类型 | 监听事件 |
|---|---|
| JS 运行时异常 | `window.onerror` / `window.addEventListener("error")` |
| Promise 拒绝 | `window.addEventListener("unhandledrejection")` |
| 资源加载失败 | `window.addEventListener("error", …, true)`（捕获阶段） |

## 手动上报

```ts
import { captureException } from "@g-heal-claw/sdk";

try {
  JSON.parse(userInput);
} catch (e) {
  captureException(e, {
    tags: { module: "settings" },
    extra: { userInput },
  });
}
```

## 过滤噪声

```ts
init({
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    /Network request failed/,
  ],
  beforeSend: (event) => {
    if (event.url.includes("/debug")) return null;
    return event;
  },
});
```

## 面包屑（Breadcrumb）

异常发生前的 **最近 50 条** 用户操作会被记录为面包屑，包括：

- 路由跳转
- 点击 / 输入事件
- API 请求
- `console.log` / `console.error`
- 其他自定义 `addBreadcrumb`

```ts
import { addBreadcrumb } from "@g-heal-claw/sdk";

addBreadcrumb({
  category: "auth",
  message: "user logged in",
  level: "info",
});
```

## 常见问题

| 问题 | 解决 |
|---|---|
| 只看到 `Script error` | 给外链脚本加 `crossorigin="anonymous"` 并在 CDN 配置 CORS |
| 堆栈是压缩代码 | 上传 Sourcemap，见 [Sourcemap 上传](/sdk/sourcemap) |
| Vue / React 异常未捕获 | 额外接入框架 ErrorBoundary / `app.config.errorHandler` |
