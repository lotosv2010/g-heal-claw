# 系统设置

路径：**系统设置** `/settings/*`

## 七个子菜单

| 菜单 | 路径 | 使用指南 |
|---|---|---|
| 应用管理 | `/settings/projects` | [应用管理](/guide/settings/projects) |
| Source Map | `/settings/sourcemaps` | [Source Map](/guide/settings/sourcemaps) |
| 告警规则 | `/settings/alerts` | [告警规则](/guide/settings/alerts) |
| 通知渠道 | `/settings/channels` | [通知渠道](/guide/settings/channels) |
| 成员与权限 | `/settings/members` | [成员与权限](/guide/settings/members) |
| AI 修复配置 | `/settings/ai` | [AI 修复配置](/guide/settings/ai) |
| API Keys | `/settings/tokens` | [API Keys](/guide/settings/tokens) |

## 通用约定

- 所有设置按**项目**作用域隔离（除组织级租户 / 成员外）
- 关键配置变更写入审计日志，可按操作人回溯
- Webhook / API Key 等敏感字段存储时 AES-256 加密，页面只显示掩码
