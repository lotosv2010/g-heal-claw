# ADR-0001: 模块化单体 NestJS 而非微服务

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-25 |
| 决策人 | @gaowenbin |

## 背景

项目初期需在有限人力（1~2 人）下快速交付完整功能闭环。微服务架构带来的优势（独立部署、故障隔离、技术栈异构）在早期团队规模下并不成立，反而引入分布式事务、服务发现、跨服务调试等复杂度。

约束条件：
- 团队 ≤ 3 人，无独立 DevOps 角色
- 产品形态尚在验证期，模块边界可能频繁调整
- 数据库一致性要求高（事件入库 + Issue 聚合需事务）
- 期望单次 `docker compose up` 即可启动全部后端

## 决策

采用 **NestJS 模块化单体**（Modular Monolith）架构：

1. 每个业务域封装为独立 NestJS Module（`GatewayModule`、`ProcessorModule`、`DashboardModule` 等）
2. 模块间通过 DI 注入 Service 实现同进程调用
3. 异步解耦通过 BullMQ 队列（同一进程内，Redis 作为 broker）
4. 模块边界通过 `.claude/rules/architecture.md` 硬编码约束（禁止循环依赖、禁止跨模块直接导入 Controller）
5. 未来流量增长时，可将 Processor 拆为独立 Worker 进程（BullMQ 天然支持多进程消费），无需改代码

## 备选方案

| 方案 | 评估 |
|---|---|
| **微服务（gRPC / HTTP）** | 分布式事务复杂；开发联调成本高；运维基础设施（注册中心、链路追踪）前置投入大 |
| **Serverless Functions** | 冷启动延迟不可控；BullMQ 等有状态依赖难以适配；本地调试体验差 |
| **纯 Express/Fastify 无框架** | 缺乏模块化能力和 DI 容器；手动管理依赖注入随规模增长迅速失控 |

## 影响

- **收益**：单仓单进程，调试体验好；共享事务（Drizzle ORM 事务跨表写入）；部署简单
- **成本**：单点故障风险（进程崩溃影响全部功能）
- **缓解**：AI Agent 已独立进程部署（ADR-0004）；ProcessorModule 可随时拆出为独立 Worker

## 后续

- 流量超过 5000 events/s 时评估拆分 Processor Worker 进程
- 详见 `docs/ARCHITECTURE.md §1` 架构总览
