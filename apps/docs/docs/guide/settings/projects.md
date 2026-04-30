# 应用管理

路径：系统设置 → **应用管理** `/settings/projects`

> 状态：建设中（Phase 1 交付）

## 能力规划

Dashboard 支持**多租户 / 多项目 / 多环境**，所有上报数据按项目隔离。

### 新建项目

| 字段 | 说明 |
|---|---|
| 项目名称 | 建议带平台后缀，如 `my-app-web` / `my-app-h5` / `my-app-mp` |
| 平台 | Web / H5 / 小程序（影响默认采集项） |
| 语言 | Dashboard 默认显示语言 |
| 环境 | production / staging / development（SDK 可覆盖） |

### DSN 与 Key

创建后自动生成两把 Key：

| Key | 用途 | 可暴露在浏览器 |
|---|---|---|
| `publicKey` | SDK 上报事件（仅写） | ✅ |
| `secretKey` | Sourcemap 上传（CLI） | ❌ 绝对不可 |

DSN 格式：`https://<publicKey>@<gateway-host>/<projectId>`

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
