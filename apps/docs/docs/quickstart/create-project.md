# 创建项目

Dashboard 支持**多租户 / 多项目 / 多环境**管理。所有上报数据都按项目隔离。

## 新建项目

路径：系统设置 → **项目管理** → 新建项目

| 字段 | 说明 |
|---|---|
| 项目名称 | 建议带平台后缀，如 `my-app-web` / `my-app-h5` / `my-app-mp` |
| 平台 | Web / H5 / 小程序（影响默认采集项） |
| 语言 | 决定 Dashboard 的语言默认值 |
| 环境 | production / staging / development（可在 SDK 初始化时覆盖） |

## DSN 说明

创建项目后自动生成两把 Key：

| Key | 用途 | 可暴露在浏览器 |
|---|---|---|
| `publicKey` | SDK 上报事件（仅写） | ✅ |
| `secretKey` | Sourcemap 上传（CLI） | ❌ 绝对不可 |

DSN 格式：`https://<publicKey>@<gateway-host>/<projectId>`

## 多环境最佳实践

**推荐方式**：一个项目对应一个发布目标，通过 `environment` 字段区分环境。

```ts
init({
  dsn: import.meta.env.VITE_GHC_DSN,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION,
});
```

Dashboard 支持按 `environment` 过滤所有视图。

## 项目成员

路径：系统设置 → **成员管理**

| 角色 | 权限 |
|---|---|
| Owner | 全部权限，包括删除项目 |
| Admin | 配置修改、成员邀请 |
| Member | 只读查看 Dashboard |
