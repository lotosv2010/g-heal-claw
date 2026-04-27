# 决策记录（Decisions）

> 此目录存放对项目长期产生影响的架构、技术选型、流程与运营决策，采用 ADR（Architecture Decision Record）格式撰写。每次重要权衡落地后新增一份文件。

## 命名与模板

- 文件名：`NNNN-slug.md`，其中 `NNNN` 为四位递增编号（ADR-0001、ADR-0002…）。
- 建议模板：

```markdown
# ADR-NNNN: 决策标题

| 字段 | 值 |
|---|---|
| 状态 | 提议 / 采纳 / 废弃 / 被 ADR-XXXX 取代 |
| 日期 | YYYY-MM-DD |
| 决策人 | @name |

## 背景
（为什么需要这个决策，约束是什么）

## 决策
（具体选择了什么方案）

## 备选方案
（考虑过哪些，为什么不选）

## 影响
（成本 / 收益 / 风险）

## 后续
（相关依赖改动、跟踪事项）
```

## 索引

现阶段重要决策摘录，详细文档按需补全：

| 编号 | 决策 | 状态 |
|---|---|---|
| ADR-0001 | 模块化单体 NestJS 而非微服务 | 采纳 |
| ADR-0002 | MVP 使用 BullMQ 而非 Kafka | 采纳 |
| ADR-0003 | 使用 Drizzle 而非 Prisma 作为 ORM | 采纳 |
| ADR-0004 | AI Agent 独立进程部署 | 采纳 |
| ADR-0005 | Sourcemap 服务端还原（非客户端） | 采纳 |
| ADR-0006 | 告警引擎采用 Pull 式定时评估 | 采纳 |
| ADR-0007 | 实时推送走 Redis Pub/Sub + SSE（非 WebSocket） | 采纳 |
| ADR-0008 | 跨标签页 Session 同步走 BroadcastChannel + storage | 采纳 |
| [ADR-0009](./0009-shared-package-baseline.md) | packages/shared 基线：Env Schema + parseEnv 纯函数、按 app 切片、tsc 直出、一子类型一文件 | 采纳 |
| [ADR-0010](./0010-sdk-skeleton-and-examples.md) | SDK 骨架边界 + examples/ 目录（Next.js demo）+ Vite Library Mode（ESM + UMD） | 采纳 |
| [ADR-0011](./0011-server-skeleton.md) | apps/server 骨架：NestJS + Fastify + Gateway 收端（不入队 / 不落库 / 不鉴权） | 采纳 |
| [ADR-0012](./0012-web-skeleton.md) | apps/web 骨架：Next.js App Router + 10 页路由 + 仅落地"页面性能"（手写 UI 原语 / CSS 趋势条 / mock fixture） | 采纳 |

> 当你需要为某条决策补充详细背景或推翻旧决策时，请新增 `0001-xxx.md`（而非修改旧文件），并在此索引更新状态。
