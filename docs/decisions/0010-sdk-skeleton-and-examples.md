# ADR-0010: SDK 骨架与 examples 目录设计

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-27 |
| 决策人 | @gaowenbin |
| 关联任务 | T1.2.1（SDK 骨架）+ 新增 `examples/` 基础设施 |

## 背景

`packages/sdk` 是所有前端接入项的唯一入口（SPEC §3），需承担：

1. `GHealClaw.init()` 运行时入口 + 全量可选配置 `GHealClawOptions`
2. DSN 解析 → `publicKey` / `host` / `projectId`
3. Hub 单例：维持全局 user / tags / context / breadcrumbs 栈
4. Plugin 接口：供 ErrorPlugin / PerformancePlugin / ApiPlugin 等后续插件挂载
5. Transport 占位：后续 T1.2.5 才落地 beacon/fetch/image 协商

ADR-0009 已建立 `packages/shared`（Zod Schema + 常量），SDK 必须从 shared 消费 `SdkEventSchema`、`BaseEventSchema` 类型而非重造。

本 ADR 解决两件事：
- 锁定 SDK 骨架（T1.2.1）的**交付边界**，防止与后续插件任务（T1.2.2~T1.2.9）重叠
- 为端到端冒烟与 Dogfood 需要，建立 `examples/` 基础设施，放一个 Next.js demo 接入 SDK

## 决策

### 1. SDK 骨架交付边界（T1.2.1）

仅落地以下能力，异常捕获、性能采集、上报传输、持久化均留给后续任务：

| 模块 | 本次交付 | 后续任务 |
|---|---|---|
| `init(options)` | ✅ 解析 DSN、建 Hub、加载插件、触发 plugin.setup | — |
| `parseDsn(dsn)` | ✅ 返回 `{ publicKey, host, projectId }` 或抛错 | — |
| `Hub` 单例 | ✅ `setUser` / `setTag` / `setContext` / `getScope` | — |
| `Plugin` 接口 | ✅ `{ name, setup(hub, options) }` | — |
| `captureMessage(msg, level?)` | ✅ 手动上报（用于 demo 冒烟） | — |
| `captureException(err, ctx?)` | ✅ 最小实现（组装 error 事件，无堆栈解析） | T1.2.2 接入 `window.onerror` |
| `addBreadcrumb(bc)` | ✅ Hub 内环形缓冲 | T1.2.3 自动采集 |
| Transport | ✅ 占位 `FetchTransport`（单事件 `fetch` POST） | T1.2.5 批量 + beacon + image + 协商 |
| 事件构造 | ✅ 填充 `BaseEvent.device / page / session` 的最小字段 | T1.2.4 完整 ua-parser / network |
| IndexedDB 兜底 | ❌ 不做 | T1.2.6 |
| 采样 / `beforeSend` / `ignoreErrors` | ❌ 不做 | T1.2.7 |
| 构建产物 | ✅ Vite Library Mode：ESM + UMD + `.d.ts` | — |
| 体积预算 | ✅ 骨架阶段目标 gzip < 5KB（预留插件空间） | T1.2.8 |

**设计模式**：
- Hub 为**模块级单例**（非全局 `window` 变量），通过 `getCurrentHub()` 暴露；测试可通过 `resetHub()` 重置
- Plugin 接口极简：`{ name: string; setup(hub: Hub, options: GHealClawOptions): void }`，后续扩展不破坏兼容
- `SdkEvent` 类型直接复用 `@g-heal-claw/shared`，不手写重复类型

### 2. examples 目录

位置：**仓库根级 `examples/`**，不纳入 `apps/*`（保留 apps 语义为生产交付应用）。

```
examples/
└── nextjs-demo/          # SDK 冒烟 + DSN 配置展示
    ├── app/
    │   ├── layout.tsx    # 客户端 init SDK
    │   ├── page.tsx      # 触发按钮：captureMessage / throwError / manualBreadcrumb
    │   └── ghc-provider.tsx  # 'use client' 包装
    ├── package.json      # 依赖 workspace:@g-heal-claw/sdk
    ├── next.config.mjs
    ├── tsconfig.json
    ├── postcss.config.mjs
    └── .env.example      # NEXT_PUBLIC_GHC_DSN
```

**pnpm workspace** 扩展：

```yaml
packages:
  - "packages/*"
  - "apps/*"
  - "examples/*"        # 新增
```

demo 通过 `workspace:*` 硬链 SDK，SDK 源码改动 `pnpm dev` 会自动联动（Vite watch mode + Next.js Fast Refresh）。

**Turbo 任务隔离**：examples 不进 CI 的 `build` / `test` 流水线（通过根 `turbo.json` 的 `pipeline.filter` 或 `--filter=!./examples/*` 排除）；本地 `pnpm -F nextjs-demo dev` 按需启动。

### 3. SDK 构建：Vite Library Mode

对齐 ADR-0009 最新规则："SDK / CLI / Vite Plugin 使用 Vite Library Mode；纯类型包使用 tsc"。

产物：
- `dist/sdk.esm.js` — ESM，供 bundler 消费
- `dist/sdk.umd.js` — UMD，挂 `window.GHealClaw`，供 CDN `<script>` 直接引入
- `dist/sdk.d.ts` — 类型声明（由 `vite-plugin-dts` 产出）
- `dist/sdk.esm.js.map` / `dist/sdk.umd.js.map`

`package.json` `exports` 同时暴露 `import` / `require`（UMD）/ `types` 条件。

### 4. demo 技术栈

- Next.js 15 App Router + TypeScript + Tailwind v4（与 `apps/web` 对齐）
- SDK 在顶层 `app/ghc-provider.tsx`（`'use client'`）中 `init`，读取 `NEXT_PUBLIC_GHC_DSN`
- 不依赖 shadcn/ui（demo 用原生 button / div，保持依赖最小）
- 端口 3100，避开 server/web/ai-agent

### 5. Env & DSN 策略

demo 从 `NEXT_PUBLIC_GHC_DSN` 读取 DSN（Next.js 规定 `NEXT_PUBLIC_*` 才能在客户端使用）。不引入 `@g-heal-claw/shared` 的 ServerEnvSchema（那是服务端契约）。`.env.example` 提供占位：

```
NEXT_PUBLIC_GHC_DSN=http://pk_xxx@localhost:3001/proj_demo
NEXT_PUBLIC_GHC_ENV=development
NEXT_PUBLIC_GHC_RELEASE=v0.1.0
```

## 备选方案

### A. `examples/` 根级 + workspace 纳入（**采纳**）

- ✅ 与 `apps/*` 语义解耦，demo 不会被误认为生产应用
- ✅ `workspace:*` 实现源码联调
- ✅ 与 Sentry / PostHog / Clerk 等主流 SDK 仓库惯例一致

### B. `apps/examples-nextjs/`

- ❌ 污染 apps 语义，CI 可能误将其纳入生产构建
- ❌ 架构红线"apps 之间禁止互相 import"会对这种辅助应用产生误判成本

### C. SDK 骨架 + ErrorPlugin 合并到 T1.2.1

- ❌ 违反最小变更：ErrorPlugin 涉及 `window.onerror` / `unhandledrejection` 生命周期管理、资源错误捕获，属 T1.2.2 范畴
- ❌ 导致骨架测试与插件测试纠缠，不利于迭代

### D. SDK 仅构建 ESM

- ❌ 无 UMD 无法直接 CDN `<script>` 接入（SPEC §GETTING_STARTED 第 7 段示例要求 CDN 能用）

### E. demo 使用 Pages Router

- ❌ 与 `apps/web` App Router 技术栈不一致，维护心智成本

## 影响

### 正向

- **最小骨架可跑通**：init → captureMessage → Transport 发到 Gateway，即便 Gateway 还没落地也可打到 `localhost:3001/ingest/v1/events`（404 也能验证传输层行为）
- **dogfood 闭环起点**：examples 提供持续演进的冒烟阵地，T1.2.2 ~ T1.2.9 每步都能在这里验证
- **类型统一**：SDK 消费 shared 的 `SdkEvent`，SDK 修改不影响 Gateway 契约

### 负向 / 成本

- pnpm workspace 多出 `examples/*`，`pnpm install` 会解析 demo 依赖（Next.js ~300MB `node_modules`）；缓解：CI `--filter=!./examples/*`
- SDK 构建产物增加 UMD 格式，构建产物体积略增；gzip < 5KB 目标仍留足空间

### 对现有契约的改动

- **SPEC.md**：无改动
- **ARCHITECTURE.md**：无改动（examples 不进拓扑图）
- **pnpm-workspace.yaml**：新增 `examples/*` 一行
- **`.gitignore`**：`examples/*/node_modules` 已被全局 `node_modules/` 覆盖
- **`turbo.json`**：demo 不注册 `build` / `test` 任务，保持清单干净

## 后续

- T1.2.1 落地本 ADR 的 SDK 骨架
- T1.2.1.ex 落地 `examples/nextjs-demo`（同批交付，便于冒烟）
- T1.2.2 在骨架上接入 ErrorPlugin 时，demo 同步更新验证按钮
- T1.2.8 SDK 构建任务会在此基础上加入体积预算 CI Gate
- 后续若新增 Vue demo，放在 `examples/vue-demo/` 同级
