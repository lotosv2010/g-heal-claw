# 快速上手

本篇带你用 5 分钟完成 SDK 接入并在 Dashboard 看到第一条数据。

## 前置条件

- 已有一个 Web 项目（React / Vue / 原生 JS 均可）
- 已拿到 Dashboard 的访问地址

## 步骤 1：创建项目

1. 打开 Dashboard → 系统设置 → **项目管理**
2. 点击「新建项目」，填写名称（例如 `my-app-web`）
3. 保存后，复制自动生成的 **DSN**，形如：

```
https://abcd1234@ingest.your-domain.com/project-id-xxxxx
```

## 步骤 2：安装 SDK

```bash
pnpm add @g-heal-claw/sdk
# 或
npm install @g-heal-claw/sdk
```

## 步骤 3：初始化

在应用入口（如 `main.ts` / `index.tsx`）尽早执行：

```ts
import { init } from "@g-heal-claw/sdk";

init({
  dsn: "https://abcd1234@ingest.your-domain.com/project-id-xxxxx",
  release: "1.0.0",         // 建议注入构建号
  environment: "production", // production / staging / development
});
```

## 步骤 4：触发一次测试数据

随便在页面上抛一个错：

```ts
setTimeout(() => {
  throw new Error("hello g-heal-claw");
}, 1000);
```

## 步骤 5：在 Dashboard 查看

打开 Dashboard → 监控中心 → **异常分析**，你会在 1 分钟内看到这条数据。

## 下一步

- [创建项目](/quickstart/create-project) — 了解多项目与多环境管理
- [SDK 安装与初始化](/sdk/installation) — 完整配置项与插件
- [Dashboard 菜单总览](/guide/dashboard-overview) — 熟悉四组菜单
