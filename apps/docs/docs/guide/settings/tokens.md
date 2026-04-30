# API Keys

路径：系统设置 → **API Keys** `/settings/tokens`

> 状态：建设中（Phase 1 交付）

## 用途

开放 API 访问令牌，用于：

- 外部系统查询 Dashboard 数据（BI 看板 / CI/CD 反查质量）
- 自研告警渠道回调
- Sourcemap CLI 上传的 `secretKey`（项目级，不在此页面管理）

## 令牌类型

| 类型 | 作用域 | 过期策略 |
|---|---|---|
| **Read Token** | 仅查询 | 长期（可手动吊销） |
| **Write Token** | 查询 + 写入告警 / Issue 状态 | 建议 90 天轮换 |

## 安全要求

- 令牌创建后**只显示一次**，请立即复制到安全的秘钥管理系统（Vault / AWS Secrets Manager）
- 禁止写入代码仓库 / CI 日志
- 支持 IP 白名单绑定，缩小泄露影响面

## 吊销

误泄露的令牌应立即吊销：该令牌对应的所有请求返回 `401`，不可恢复。
