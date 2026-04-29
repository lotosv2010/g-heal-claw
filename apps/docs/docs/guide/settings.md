# 系统设置

路径：**系统设置** `/settings/*`

## 七个子菜单

| 菜单 | 路径 | 用途 |
|---|---|---|
| 项目管理 | `/settings/projects` | 项目创建 / DSN 查看 / 删除归档 |
| Sourcemap | `/settings/sourcemaps` | 已上传 Sourcemap 清单与回溯 |
| 告警规则 | `/settings/alerts` | 按指标 / 阈值创建告警 |
| 通知渠道 | `/settings/channels` | 邮件 / 飞书 / 钉钉 / 企微 / Webhook |
| 成员管理 | `/settings/members` | 邀请成员 / 分配角色 |
| AI 配置 | `/settings/ai` | AI 自愈策略与触发阈值 |
| API Keys | `/settings/tokens` | 开放 API 的 Access Token |

## 项目管理

Dashboard 支持**多租户 / 多项目 / 多环境**，所有上报数据按项目隔离。

### 新建项目

路径：系统设置 → **项目管理** → 新建项目

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

## 成员管理

| 角色 | 权限 |
|---|---|
| Owner | 全部权限，包括删除项目 |
| Admin | 配置修改、成员邀请 |
| Member | 只读查看 Dashboard |

## 告警规则最佳实践

告警触发条件的完整口径见 [接口说明 · 异常分析指标 · 告警触发条件](/reference/error-metrics#告警触发条件)。典型配置：

| 场景 | 建议配置 |
|---|---|
| 新增异常即告警 | 首次出现 → 邮件 + 飞书 |
| 突增告警 | 1 分钟内异常数 > 过去 1 小时均值的 5 倍 |
| Core Web Vitals 恶化 | LCP P75 连续 10 分钟 > 4s |
| 5xx 飙升 | 错误率 > 5% 持续 2 分钟 |

## 通知渠道配置

每个渠道需在对应平台创建 Webhook / Bot Token。平台步骤见对应平台官方文档。

## AI 自愈策略

| 模式 | 行为 |
|---|---|
| **仅诊断** | AI 生成诊断报告，不创建 PR |
| **自动 PR（默认）** | 符合白名单的 Issue → 自动 PR 到指定分支 |
| **需人工确认** | AI 产出方案，等待人工点击「生成 PR」 |
