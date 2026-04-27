# nextjs-demo

最小化 Next.js 15 App Router 示例，用于本地验证 `@g-heal-claw/sdk` 的浏览器端采集链路。

## 快速开始

```bash
# 1. 确保 monorepo 根目录已安装依赖
pnpm install

# 2. 复制环境变量模板，按需修改 DSN 指向 apps/server
cp examples/nextjs-demo/.env.example examples/nextjs-demo/.env.local

# 3. 启动（端口 3100，避免和 apps/server 3001 / apps/web 3000 冲突）
pnpm -F nextjs-demo dev
```

打开 <http://localhost:3100>，点击三个按钮观察 Network 面板中的
`POST /ingest/v1/events` 请求。

## 说明

- 通过 `next.config.ts` 的 `transpilePackages` 直接编译 workspace 源码，SDK 改动无需重新 build
- `app/ghc-provider.tsx` 在客户端挂载时执行 `init()`，避免 SSR 阶段访问 `window`
- 三个测试按钮覆盖 T1.2.1 骨架阶段全部公开 API
