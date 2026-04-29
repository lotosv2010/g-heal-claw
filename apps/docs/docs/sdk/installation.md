# 安装与初始化

## 安装

```bash
pnpm add @g-heal-claw/sdk
# 或 npm / yarn
npm install @g-heal-claw/sdk
yarn add @g-heal-claw/sdk
```

## 基础初始化

在应用入口（`main.ts` / `index.tsx` / `app.ts`）**尽早**调用：

```ts
import { init } from "@g-heal-claw/sdk";

init({
  dsn: "https://<publicKey>@<gateway-host>/<projectId>",
});
```

建议把初始化放在所有业务代码**之前**，保证 SDK 能捕获启动阶段的异常。

## 完整配置

```ts
init({
  dsn: string,              // 必填
  release?: string,         // 版本号，如 "1.2.3" 或 Git SHA
  environment?: string,     // "production" | "staging" | "development"
  sampleRate?: number,      // 0~1，默认 1（全采样）
  userId?: string,          // 用户标识，也可稍后 setUser()
  plugins?: Plugin[],       // 自定义插件
  ignoreErrors?: (string | RegExp)[], // 黑名单
  beforeSend?: (event) => event | null, // 上报前钩子
});
```

## 设置用户信息

```ts
import { setUser } from "@g-heal-claw/sdk";

setUser({
  id: "user-123",
  username: "alice",
  email: "alice@example.com",
});
```

## 手动上报

```ts
import { captureException, captureMessage } from "@g-heal-claw/sdk";

try {
  doSomething();
} catch (e) {
  captureException(e, { tags: { module: "checkout" } });
}

captureMessage("user bought premium", { level: "info" });
```

## 框架集成

| 框架 | 位置 |
|---|---|
| React | `main.tsx` 第一行 |
| Vue 3 | `main.ts` 的 `createApp` 之前 |
| Nuxt | `plugins/ghc.client.ts` |
| Next.js | `app/layout.tsx` 中客户端组件 |
| Umi | `app.ts` 的 `render` 之前 |
