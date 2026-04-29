# 快速上手

5 分钟完成 SDK 接入并在 Dashboard 看到第一条数据。

## 前置条件

- 已有一个 Web 项目（React / Vue / 原生 JS 均可）
- 已拿到 Dashboard 的访问地址

## 步骤 1：创建项目并拿到 DSN

Dashboard → **系统设置 → 项目管理 → 新建项目**，保存后复制自动生成的 DSN：

```
https://abcd1234@ingest.your-domain.com/project-id-xxxxx
```

> 字段说明、Key 差异、多环境策略见 [系统设置 · 项目管理](/guide/settings#项目管理)。

## 步骤 2：安装 SDK

```bash
pnpm add @g-heal-claw/sdk
```

## 步骤 3：初始化

在应用入口（`main.ts` / `index.tsx`）尽早执行：

```ts
import { init } from "@g-heal-claw/sdk";

init({
  dsn: "https://abcd1234@ingest.your-domain.com/project-id-xxxxx",
  release: "1.0.0",
  environment: "production",
});
```

> 完整配置项、框架集成、手动上报见 [SDK · 安装与初始化](/sdk/installation)。

## 步骤 4：触发测试数据

```ts
setTimeout(() => {
  throw new Error("hello g-heal-claw");
}, 1000);
```

## 步骤 5：在 Dashboard 查看

监控中心 → **异常分析**，1 分钟内可见这条数据。

## 下一步

- [入门指南 · 菜单总览](/guide/dashboard-overview) — 熟悉四组菜单
- [接口说明 · 指标字典](/reference/) — 所有指标的权威定义
- [SDK 说明 · 安装与初始化](/sdk/installation) — 完整 SDK 参考
