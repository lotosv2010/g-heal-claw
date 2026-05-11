# 应用管理

路径：系统设置 → **应用管理** `/settings/projects`

## 功能概述

Dashboard 支持**多租户 / 多项目 / 多环境**，所有上报数据按项目隔离。应用管理页面提供项目的创建、搜索、分类筛选和配置管理。

### 页面功能

- **搜索** — 支持按项目名称、slug 或 ID 模糊搜索
- **平台分类** — 按 Web / H5 / 小程序 / 原生 APP / Node.js / 其他 筛选，显示各分类数量
- **项目卡片** — 展示项目名、平台图标、ID（可一键复制）、slug、数据保留天数、创建时间
- **操作** — 编辑项目信息、删除项目

### 新建项目

| 字段 | 说明 |
|---|---|
| 项目名称 | 建议带平台后缀，如 `my-app-web` / `my-app-h5` / `my-app-mp` |
| 项目标识（slug） | 唯一英文标识，用于 URL 等场景 |
| 平台 | Web / H5 / 小程序 / 原生 APP / Node.js / 其他 |

### DSN 与 Key

创建后自动生成两把 Key，在「设置 → API Keys」页面查看：

| Key | 用途 | 可暴露在浏览器 |
|---|---|---|
| `publicKey` | SDK 上报事件（仅写），填入 DSN | ✅ |
| `secretKey` | Sourcemap 上传（CLI） | ❌ 绝对不可 |

DSN 格式：`http://<publicKey>@<host>:<port>/<projectId>`

> **注意**：DSN 中的 `<projectId>` 是项目的内部 ID（如 `proj_ncRJWLQnYx`），不是 slug。可在项目卡片中一键复制。

### 接入示例

```ts
import { init, errorPlugin, performancePlugin } from "@g-heal-claw/sdk";

init({
  dsn: "http://pub_xxx@localhost:3001/proj_xxx",  // 项目 ID
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION,
}, {
  plugins: [errorPlugin(), performancePlugin()],
});
```

### 多环境最佳实践

**一个项目对应一个发布目标**，通过 `environment` 区分环境：

```ts
init({
  dsn: import.meta.env.VITE_GHC_DSN,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION,
});
```

Dashboard 顶栏可按 `environment` 过滤所有视图。
