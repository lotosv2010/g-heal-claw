# 通知渠道

路径：系统设置 → **通知渠道** `/settings/channels`

> 状态：建设中（Phase 4 交付）

## 支持的渠道

| 渠道 | 认证方式 | 典型延迟 |
|---|---|---|
| 邮件 | SMTP / SES | 秒~分钟 |
| 飞书 | 自定义机器人 Webhook | 秒 |
| 钉钉 | 自定义机器人 Webhook + 加签 | 秒 |
| 企微 | 群机器人 Webhook | 秒 |
| Webhook | 任意 HTTPS POST（可接入 Slack / Discord / 自研网关） | 秒 |

## 配置步骤

1. 在对应平台创建 Webhook / Bot Token（详见各平台官方文档）
2. Dashboard → 通知渠道 → 新建 → 填入 URL + Secret
3. 点击「发送测试消息」验证连通
4. 在 [告警规则](/guide/settings/alerts) 中选择该渠道生效

## 消息模板

每条告警消息包含：

- 项目名 · 环境 · release
- 触发规则名 · 当前值 vs 阈值
- Dashboard 深链（直达 Issue / 大盘）
- 静默 / 已知按钮（部分平台支持）
